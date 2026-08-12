#!/usr/bin/env python3
"""
Sondeo ERC-8004 en BSC mainnet (Semana 1 — gate del hackathon).

Lee los registros Identity + Reputation de DOS implementaciones desplegadas en
BSC (oficial ERC-8004 y BRC8004) vía RPC público y mide, por agente:

  (a) AgentCard resoluble  — el tokenURI apunta a una card que responde 200 + JSON
  (b) feedback onchain      — el Reputation Registry tiene >=1 feedback para el agente
  (c) actividad 30 días     — algún evento del agente (registro/feedback/respuesta)
                              dentro de la ventana de ~30 días de bloques

Salida: output/agents_<fecha>.csv  +  output/summary_<fecha>.md

Diseño (matices del gate):
  - BRC8004 es enumerable (totalSupply/tokenByIndex) -> a/b/c COMPLETO sobre sus agentes.
  - El oficial 0x8004A169... NO expone totalSupply -> se MUESTREA por eventos Registered.
  - Cero LLM, cero secretos. Solo RPC públicos. Analogía: es un "censo" de la cadena,
    no una auditoría exhaustiva; el objetivo es el catálogo semilla, no el padrón entero.

Deps: requests, eth-abi, eth-utils  (ver requirements.txt)
"""

from __future__ import annotations

import argparse
import csv
import ipaddress
import json
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_utils import keccak, to_checksum_address

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

# RPC públicos de BSC (chainId 56).
# NOTA: los dataseed.bnbchain.org / defibit.io rechazan getLogs con "limit exceeded"
# -> solo sirven para eth_call/eth_blockNumber. Para getLogs usar publicnode/1rpc.
RPC_ENDPOINTS_CALL = [
    # eth_call / eth_blockNumber / eth_getBlockByNumber — todos los endpoints
    "https://bsc.publicnode.com",
    "https://1rpc.io/bnb",
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-dataseed1.ninicoin.io",
]
RPC_ENDPOINTS_LOGS = [
    # getLogs — solo los que lo soportan sin "limit exceeded"
    "https://bsc.publicnode.com",
    "https://1rpc.io/bnb",
]

# Para compatibilidad usa CALL por defecto; los métodos de logs usan su propio cliente
RPC_ENDPOINTS = RPC_ENDPOINTS_CALL

# Registros desplegados en BSC mainnet (verificados por sonda RPC 2026-08-11).
REGISTRIES = {
    "brc8004": {
        "label": "BRC8004 (fork BNB Chain)",
        "identity": "0xfA09B3397fAC75424422C4D28b1729E3D4f659D7",
        "reputation": "0x17860530385Bdde7992c4Da71B9ec7791E474C08",
        "enumerable": True,   # totalSupply/tokenByIndex -> censo completo
    },
    "official": {
        "label": "ERC-8004 oficial (vanity 0x8004)",
        "identity": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        "reputation": "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
        "enumerable": False,  # totalSupply revierte -> muestreo por eventos Registered
    },
}

# Umbrales del gate (CLAUDE.md): >=500 => plan A ; <100 => pivote a curación.
GATE_PLAN_A = 500
GATE_PIVOT = 100

DEFAULT_OFFICIAL_SAMPLE = 40        # cuántos agentes muestrear del registro no enumerable
DEFAULT_CARD_WORKERS = 8            # concurrencia del fetch offchain de AgentCards
DEFAULT_ACTIVITY_BLOCKS = 60_000    # ventana de actividad default (~27 min BSC; publicnode limite).
                                    # Usa --full-30d para barrido completo (requiere RPC archivo privado).
CARD_TIMEOUT = 8                    # s por card
CARD_MAX_BYTES = 512 * 1024        # tope de tamaño de respuesta (defensa)
IPFS_GATEWAY = "https://ipfs.io/ipfs/"

LOG_CHUNK = 2_000                   # publicnode.com acepta hasta ~5k; 2k es seguro
LOG_CHUNK_MIN = 500
LOG_MAX_CHUNKS = 30                 # 2k × 30 = 60k bloques max (~27 min BSC); usar --full-30d para más

# Firmas de evento -> topic0 (se calculan, no se hardcodean)
EV_REGISTERED = "Registered(uint256,string,address)"
EV_URI_UPDATED = "URIUpdated(uint256,string,address)"
EV_METADATA_SET = "MetadataSet(uint256,string,string,bytes)"
EV_NEW_FEEDBACK = "NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)"
EV_FEEDBACK_REVOKED = "FeedbackRevoked(uint256,address,uint64)"
EV_RESPONSE_APPENDED = "ResponseAppended(uint256,address,uint64,address,string,bytes32)"

# Eventos cuyo topics[1] == agentId (indexado). Sirven para atribuir actividad al agente.
AGENT_EVENT_SIGS = [
    EV_REGISTERED, EV_URI_UPDATED, EV_METADATA_SET,
    EV_NEW_FEEDBACK, EV_FEEDBACK_REVOKED, EV_RESPONSE_APPENDED,
]


def topic0(sig: str) -> str:
    return "0x" + keccak(text=sig).hex()


AGENT_EVENT_TOPICS = {topic0(s): s for s in AGENT_EVENT_SIGS}
TOPIC_REGISTERED = topic0(EV_REGISTERED)
TOPIC_NEW_FEEDBACK = topic0(EV_NEW_FEEDBACK)

# --------------------------------------------------------------------------- #
# Capa RPC (rotación + reintentos)
# --------------------------------------------------------------------------- #


class RpcError(Exception):
    pass


class RevertError(RpcError):
    """execution reverted — la función no existe o no aplica en este contrato."""


class Rpc:
    def __init__(self, endpoints: list[str]):
        self.endpoints = list(endpoints)
        self.i = 0
        self.session = requests.Session()
        self._id = 0

    def _next(self):
        self.i = (self.i + 1) % len(self.endpoints)

    def call(self, method: str, params: list, *, retries: int = 4) -> object:
        self._id += 1
        payload = {"jsonrpc": "2.0", "id": self._id, "method": method, "params": params}
        last = None
        for attempt in range(retries):
            url = self.endpoints[self.i]
            try:
                r = self.session.post(url, json=payload, timeout=25)
                r.raise_for_status()
                data = r.json()
                if "error" in data:
                    msg = str(data["error"].get("message", data["error"])).lower()
                    if "revert" in msg or "execution reverted" in msg:
                        raise RevertError(msg)
                    # rate-limit / rango excesivo / nodo caído -> rota y reintenta
                    last = RpcError(msg)
                    self._next()
                    time.sleep(0.4 * (attempt + 1))
                    continue
                return data["result"]
            except RevertError:
                raise
            except (requests.RequestException, ValueError) as e:
                last = RpcError(str(e))
                self._next()
                time.sleep(0.4 * (attempt + 1))
        raise last or RpcError("agotados los reintentos RPC")

    # ---- helpers de alto nivel ----

    def block_number(self) -> int:
        return int(self.call("eth_blockNumber", []), 16)

    def block_timestamp(self, n: int) -> int:
        b = self.call("eth_getBlockByNumber", [hex(n), False])
        return int(b["timestamp"], 16)

    def eth_call(self, to: str, data_hex: str) -> bytes:
        res = self.call("eth_call", [{"to": to, "data": data_hex}, "latest"])
        return bytes.fromhex(res[2:]) if res and res != "0x" else b""


def selector(sig: str) -> bytes:
    return keccak(text=sig)[:4]


def contract_call(rpc: Rpc, addr: str, sig: str, arg_types: list[str],
                  args: list, ret_types: list[str]):
    """Llama a una función view y decodifica el retorno. Lanza RevertError si revierte."""
    data = selector(sig)
    if arg_types:
        data += abi_encode(arg_types, args)
    raw = rpc.eth_call(addr, "0x" + data.hex())
    if not raw:
        raise RevertError(f"{sig} devolvió vacío")
    return abi_decode(ret_types, raw)


def get_logs_chunked(rpc: Rpc, address: str, from_block: int, to_block: int,
                     topics: list | None = None) -> tuple[list[dict], bool]:
    """
    getLogs paginado hacia atrás (del bloque más nuevo al más viejo) con chunk
    adaptativo. Devuelve (logs, truncated). truncated=True si se alcanzó el tope
    de chunks antes de cubrir la ventana (se avisa: nada de recortes silenciosos).
    """
    logs: list[dict] = []
    chunk = LOG_CHUNK
    hi = to_block
    chunks_used = 0
    truncated = False
    while hi >= from_block:
        if chunks_used >= LOG_MAX_CHUNKS:
            truncated = True
            break
        lo = max(from_block, hi - chunk + 1)
        params = {"fromBlock": hex(lo), "toBlock": hex(hi), "address": address}
        if topics:
            params["topics"] = topics
        try:
            res = rpc.call("eth_getLogs", [params])
            logs.extend(res)
            hi = lo - 1
            chunks_used += 1
        except RpcError:
            # rango demasiado grande / cap de resultados -> reduce el chunk
            if chunk > LOG_CHUNK_MIN:
                chunk = max(LOG_CHUNK_MIN, chunk // 2)
                continue
            # ya en el mínimo y sigue fallando: salta este tramo y avisa
            truncated = True
            hi = lo - 1
            chunks_used += 1
    return logs, truncated


# --------------------------------------------------------------------------- #
# Resolución offchain de AgentCards (con defensa anti-SSRF)
# --------------------------------------------------------------------------- #


def _host_is_public(host: str) -> bool:
    """Rechaza localhost / IPs privadas / link-local / metadata cloud."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for _, _, _, _, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True


def _candidate_urls(token_uri: str) -> list[str]:
    """Normaliza el tokenURI a URLs http(s) candidatas a AgentCard."""
    if not token_uri:
        return []
    uri = token_uri.strip()
    if uri.startswith("ipfs://"):
        uri = IPFS_GATEWAY + uri[len("ipfs://"):].lstrip("/")
    parsed = urlparse(uri)
    if parsed.scheme not in ("http", "https"):
        return []
    cands = [uri]
    # Si parece un dominio "pelado" (sin fichero JSON), prueba el well-known A2A.
    path = parsed.path or ""
    if not path.rstrip("/").endswith(".json"):
        base = f"{parsed.scheme}://{parsed.netloc}"
        cands.append(base.rstrip("/") + "/.well-known/agent-card.json")
    return cands


def resolve_card(token_uri: str) -> dict:
    """
    Devuelve dict con: resolvable(bool), name(str|None), url_tried(str), note(str).
    resolvable = alguna candidata responde 200 + JSON parseable.
    """
    out = {"resolvable": False, "name": None, "url_tried": token_uri or "", "note": ""}
    cands = _candidate_urls(token_uri)
    if not cands:
        out["note"] = "uri no http/https/ipfs"
        return out
    for url in cands:
        host = urlparse(url).hostname or ""
        if not _host_is_public(host):
            out["note"] = "host no público (bloqueado)"
            continue
        try:
            r = requests.get(url, timeout=CARD_TIMEOUT, stream=True,
                             headers={"User-Agent": "erc8004-probe/1.0"})
            if r.status_code != 200:
                out["note"] = f"HTTP {r.status_code}"
                continue
            chunk = r.raw.read(CARD_MAX_BYTES + 1, decode_content=True)
            if len(chunk) > CARD_MAX_BYTES:
                out["note"] = "respuesta demasiado grande"
                continue
            card = json.loads(chunk.decode("utf-8", errors="replace"))
            out["resolvable"] = True
            out["url_tried"] = url
            if isinstance(card, dict):
                out["name"] = card.get("name") or card.get("agentName") or None
            out["note"] = "ok"
            return out
        except json.JSONDecodeError:
            out["note"] = "200 pero no es JSON"
        except requests.RequestException as e:
            out["note"] = type(e).__name__
    return out


# --------------------------------------------------------------------------- #
# Lecturas onchain por agente
# --------------------------------------------------------------------------- #


def agent_owner(rpc: Rpc, identity: str, agent_id: int) -> str | None:
    try:
        (owner,) = contract_call(rpc, identity, "ownerOf(uint256)", ["uint256"],
                                 [agent_id], ["address"])
        return to_checksum_address(owner)
    except RpcError:
        return None


def agent_token_uri(rpc: Rpc, identity: str, agent_id: int) -> str:
    try:
        (uri,) = contract_call(rpc, identity, "tokenURI(uint256)", ["uint256"],
                               [agent_id], ["string"])
        return uri
    except RpcError:
        return ""


def feedback_count_view(rpc: Rpc, reputation: str, agent_id: int) -> int | None:
    """
    Lee el recuento de feedback vía vistas del Reputation Registry.
    Devuelve int si pudo leer, None si revierte (ABI distinta / proxy no init).
    """
    try:
        (clients,) = contract_call(rpc, reputation, "getClients(uint256)",
                                   ["uint256"], [agent_id], ["address[]"])
        if not clients:
            return 0
        (count, _val, _dec) = contract_call(
            rpc, reputation, "getSummary(uint256,address[],string,string)",
            ["uint256", "address[]", "string", "string"],
            [agent_id, [to_checksum_address(c) for c in clients], "", ""],
            ["uint64", "int128", "uint8"],
        )
        return int(count)
    except RpcError:
        return None


def gather_feedback_events(rpc: Rpc, reputation: str,
                           from_block: int, to_block: int) -> tuple[dict[int, int], bool]:
    """
    UN SOLO getLogs de eventos NewFeedback en la ventana -> {agentId: count}.
    Mucho más eficiente que getLogs por agente.
    """
    logs, truncated = get_logs_chunked(
        rpc, reputation, from_block, to_block, topics=[TOPIC_NEW_FEEDBACK]
    )
    counts: dict[int, int] = {}
    for l in logs:
        if len(l["topics"]) < 2:
            continue
        aid = int(l["topics"][1], 16)
        counts[aid] = counts.get(aid, 0) + 1
    return counts, truncated


def gather_registered_events(rpc: Rpc, identity: str,
                              from_block: int, to_block: int) -> tuple[dict[int, int], bool]:
    """
    UN SOLO getLogs de eventos Registered en la ventana -> {agentId: block}.
    Sirve para detectar actividad reciente y descubrir agentIds en el registro oficial.
    """
    logs, truncated = get_logs_chunked(
        rpc, identity, from_block, to_block, topics=[TOPIC_REGISTERED]
    )
    mint_block: dict[int, int] = {}
    for l in logs:
        if len(l["topics"]) < 2:
            continue
        aid = int(l["topics"][1], 16)
        blk = int(l["blockNumber"], 16)
        mint_block[aid] = blk
    return mint_block, truncated


# --------------------------------------------------------------------------- #
# Enumeración / muestreo
# --------------------------------------------------------------------------- #


def enumerate_enumerable(rpc: Rpc, identity: str) -> list[int]:
    """
    BRC8004: totalSupply indica cuántos tokens existen, pero NO implementa
    tokenByIndex (EIP-2309/Enumerable). Los agentIds arrancan en 1 y son
    secuenciales; se verifica cada uno con ownerOf (revierte si no existe).
    Se para al llegar a 3*totalSupply sin haber encontrado todos (safety-brake).
    """
    (total,) = contract_call(rpc, identity, "totalSupply()", [], [], ["uint256"])
    total = int(total)
    ids = []
    cap = max(total * 3, total + 50)   # hueco razonable ante burns
    for candidate in range(1, cap + 1):
        if len(ids) >= total:
            break
        try:
            contract_call(rpc, identity, "ownerOf(uint256)", ["uint256"],
                          [candidate], ["address"])
            ids.append(candidate)
        except RevertError:
            continue   # token quemado / no existente
    return ids


def sample_by_events(rpc: Rpc, identity: str, head: int, target: int) -> tuple[list[int], bool]:
    """
    Registro no enumerable: muestrea agentIds de los eventos Registered más
    recientes hacia atrás hasta juntar `target`. Devuelve (ids, truncated).
    """
    logs, truncated = get_logs_chunked(
        rpc, identity, from_block=max(0, head - LOG_MAX_CHUNKS * LOG_CHUNK),
        to_block=head, topics=[TOPIC_REGISTERED],
    )
    # logs vienen del más nuevo al más viejo por bloques; ordena por bloque desc.
    logs.sort(key=lambda l: int(l["blockNumber"], 16), reverse=True)
    seen, ids = set(), []
    for l in logs:
        aid = int(l["topics"][1], 16)
        if aid not in seen:
            seen.add(aid)
            ids.append(aid)
        if len(ids) >= target:
            break
    return ids, truncated


# --------------------------------------------------------------------------- #
# Ventana de actividad 30d (escaneo de eventos por registro)
# --------------------------------------------------------------------------- #


def blocks_in_30d(rpc: Rpc, head: int) -> tuple[int, float]:
    """Estima cuántos bloques abarcan 30 días midiendo el block-time real."""
    probe = max(1, head - 200_000)
    t_head = rpc.block_timestamp(head)
    t_probe = rpc.block_timestamp(probe)
    span = max(1, head - probe)
    avg = (t_head - t_probe) / span  # s/bloque
    if avg <= 0:
        avg = 0.75  # fallback razonable (BSC post-Maxwell)
    return int(30 * 86400 / avg), avg


def gather_activity_and_feedback(
    rpc: Rpc, identity: str, reputation: str,
    from_block: int, to_block: int
) -> tuple[dict[int, int], dict[int, int], bool]:
    """
    DOS getLogs por registro (topic-filtrado), no uno por agente:
      - identity: eventos Registered  -> {agentId: last_block}
      - reputation: eventos NewFeedback -> {agentId: last_block} y {agentId: count}
    Devuelve (last_block_any_event, feedback_counts, truncated).
    """
    last_block: dict[int, int] = {}
    fb_counts: dict[int, int] = {}
    truncated_any = False

    # Registered events en identity
    logs, truncated = get_logs_chunked(rpc, identity, from_block, to_block,
                                        topics=[TOPIC_REGISTERED])
    truncated_any = truncated_any or truncated
    for l in logs:
        if len(l["topics"]) < 2:
            continue
        aid = int(l["topics"][1], 16)
        blk = int(l["blockNumber"], 16)
        if blk > last_block.get(aid, -1):
            last_block[aid] = blk

    # NewFeedback events en reputation (da actividad Y conteo)
    logs, truncated = get_logs_chunked(rpc, reputation, from_block, to_block,
                                        topics=[TOPIC_NEW_FEEDBACK])
    truncated_any = truncated_any or truncated
    for l in logs:
        if len(l["topics"]) < 2:
            continue
        aid = int(l["topics"][1], 16)
        blk = int(l["blockNumber"], 16)
        if blk > last_block.get(aid, -1):
            last_block[aid] = blk
        fb_counts[aid] = fb_counts.get(aid, 0) + 1

    return last_block, fb_counts, truncated_any


# --------------------------------------------------------------------------- #
# Orquestación
# --------------------------------------------------------------------------- #


def probe_registry(rpc: Rpc, rpc_logs: Rpc, key: str, cfg: dict, head: int,
                   win_from: int, official_sample: int,
                   card_workers: int, skip_activity: bool) -> dict:
    identity = to_checksum_address(cfg["identity"])
    reputation = to_checksum_address(cfg["reputation"])
    notes: list[str] = []

    # 1) Enumerar / muestrear agentIds
    if cfg["enumerable"]:
        agent_ids = enumerate_enumerable(rpc, identity)
        sampled = False
    else:
        agent_ids, trunc = sample_by_events(rpc_logs, identity, head, official_sample)
        sampled = True
        if trunc:
            notes.append("muestreo por eventos truncado (tope de chunks)")
    print(f"  [{key}] agentes a analizar: {len(agent_ids)}"
          f"{' (MUESTRA)' if sampled else ''}")

    # 2) Actividad y feedback via eventos (DOS getLogs por registro, topic-filtrado)
    if skip_activity:
        last_block: dict[int, int] = {}
        fb_events: dict[int, int] = {}
        notes.append("actividad omitida (--skip-activity)")
    else:
        print(f"  [{key}] escaneando actividad y feedback ({win_from}..{head})...")
        last_block, fb_events, act_trunc = gather_activity_and_feedback(
            rpc_logs, identity, reputation, win_from, head
        )
        if act_trunc:
            notes.append("escaneo de actividad/feedback truncado (tope de chunks)")

    # 3) Por agente: owner + tokenURI + feedback (onchain, ligero — sin getLogs por agente)
    rows = []
    for aid in agent_ids:
        owner = agent_owner(rpc, identity, aid)
        uri = agent_token_uri(rpc, identity, aid)

        # Feedback: vistas primero; si revierten, usamos el conteo del scan de eventos
        fb_view = feedback_count_view(rpc, reputation, aid)
        if fb_view is not None:
            fb_count, fb_method = fb_view, "view"
        elif not skip_activity:
            fb_count, fb_method = fb_events.get(aid, 0), "event-30d"
        else:
            fb_count, fb_method = -1, "view-revert"

        rows.append({
            "registry": key,
            "agent_id": aid,
            "owner": owner or "",
            "agent_uri": uri,
            "feedback_count": fb_count,
            "feedback_method": fb_method,
            "last_activity_block": last_block.get(aid, ""),
            "active_30d": aid in last_block,
        })

    # 4) AgentCards (offchain, concurrente)
    print(f"  [{key}] resolviendo {len(rows)} AgentCards...")
    with ThreadPoolExecutor(max_workers=card_workers) as ex:
        futs = {ex.submit(resolve_card, r["agent_uri"]): r for r in rows}
        for fut in as_completed(futs):
            r = futs[fut]
            card = fut.result()
            r["card_resolvable"] = card["resolvable"]
            r["card_name"] = card["name"] or ""
            r["card_note"] = card["note"]

    return {"key": key, "label": cfg["label"], "sampled": sampled,
            "rows": rows, "notes": notes}


def summarize(result: dict) -> dict:
    rows = result["rows"]
    n = len(rows)
    a = sum(1 for r in rows if r["card_resolvable"])
    b = sum(1 for r in rows if isinstance(r["feedback_count"], int) and r["feedback_count"] > 0)
    c = sum(1 for r in rows if r["active_30d"])
    seed = sum(1 for r in rows
               if r["card_resolvable"] and isinstance(r["feedback_count"], int)
               and r["feedback_count"] > 0)
    return {"n": n, "a_card": a, "b_feedback": b, "c_active": c, "seed": seed}


def gate_verdict(total_agents: int) -> str:
    if total_agents >= GATE_PLAN_A:
        return f"PLAN A ({total_agents} >= {GATE_PLAN_A})"
    if total_agents < GATE_PIVOT:
        return (f"PIVOTE A CURACION ({total_agents} < {GATE_PIVOT}) -- "
                f"catalogo de 'los N verificados de BSC'")
    return f"ZONA GRIS ({GATE_PIVOT} <= {total_agents} < {GATE_PLAN_A}) -- decidir manualmente"


def write_csv(path: Path, results: list[dict]):
    cols = ["registry", "agent_id", "owner", "agent_uri", "card_resolvable",
            "card_name", "feedback_count", "feedback_method",
            "last_activity_block", "active_30d", "card_note"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for res in results:
            for r in sorted(res["rows"], key=lambda x: x["agent_id"]):
                w.writerow(r)


def write_summary(path: Path, results: list[dict], meta: dict):
    lines = []
    lines.append("# Sondeo ERC-8004 en BSC — resumen del gate\n")
    lines.append(f"- Fecha: {meta['ts']}")
    act_days = meta.get("act_days", 0)
    act_label = f"~{act_days:.1f}d" if act_days else "omitida"
    lines.append(f"- Bloque cabeza: {meta['head']}  |  block-time medido: {meta['avg']:.3f}s")
    lines.append(f"- Ventana 30d: bloques {meta['win_from']} a {meta['head']} "
                 f"(~{meta['blocks_30d']:,} bloques)")
    lines.append(f"- Ventana de actividad escaneada: {act_label}\n")

    grand = 0
    seed_total = 0
    for res in results:
        s = summarize(res)
        grand += s["n"]
        seed_total += s["seed"]
        tag = " (MUESTRA)" if res["sampled"] else " (censo completo)"
        lines.append(f"## {res['label']}{tag}")
        lines.append(f"- Agentes analizados: **{s['n']}**")
        lines.append(f"- (a) AgentCard resoluble: **{s['a_card']}**")
        lines.append(f"- (b) con feedback onchain: **{s['b_feedback']}**")
        lines.append(f"- (c) activos en ventana escaneada: **{s['c_active']}**")
        lines.append(f"- **Catalogo semilla (card viva + feedback): {s['seed']}**")
        for note in res["notes"]:
            lines.append(f"- AVISO: {note}")
        lines.append("")

    lines.append("## Veredicto del gate")
    lines.append(f"- Agentes totales observados: **{grand}** "
                 f"(BRC8004 = censo completo; oficial = muestra, no exhaustivo)")
    lines.append(f"- **{gate_verdict(grand)}**")
    lines.append(f"- **Catalogo semilla total (card resoluble + feedback): {seed_total}**")
    lines.append("")
    lines.append("> Nota: el registro oficial se muestrea por eventos Registered, "
                 "no se barre entero; 'totales observados' es un minimo para el oficial.")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="Sondeo ERC-8004 en BSC mainnet")
    ap.add_argument("--official-sample", type=int, default=DEFAULT_OFFICIAL_SAMPLE)
    ap.add_argument("--card-workers", type=int, default=DEFAULT_CARD_WORKERS)
    ap.add_argument("--skip-activity", action="store_true",
                    help="omite el escaneo de actividad (mas rapido)")
    ap.add_argument("--full-30d", action="store_true",
                    help="escanear 30d completos de actividad (lento en RPC publico)")
    ap.add_argument("--activity-blocks", type=int, default=DEFAULT_ACTIVITY_BLOCKS,
                    help=f"bloques a escanear para actividad (default {DEFAULT_ACTIVITY_BLOCKS})")
    ap.add_argument("--only", choices=list(REGISTRIES.keys()),
                    help="analizar solo un registro")
    ap.add_argument("--rpc", action="append", help="RPC extra (repetible)")
    args = ap.parse_args()

    endpoints = (args.rpc or []) + RPC_ENDPOINTS_CALL
    rpc = Rpc(endpoints)
    # Cliente separado para getLogs — solo endpoints que lo soportan
    logs_endpoints = (args.rpc or []) + RPC_ENDPOINTS_LOGS
    rpc_logs = Rpc(logs_endpoints)

    chain_id = int(rpc.call("eth_chainId", []), 16)
    if chain_id != 56:
        print(f"ERROR: chainId {chain_id} != 56 (BSC mainnet). Abortando.", file=sys.stderr)
        sys.exit(1)

    head = rpc.block_number()
    blocks_30d, avg = blocks_in_30d(rpc, head)
    win_from_30d = max(0, head - blocks_30d)

    # Ventana de actividad efectiva (30d completo solo con --full-30d)
    if args.skip_activity:
        act_blocks = 0
        win_from = win_from_30d
    elif args.full_30d:
        act_blocks = blocks_30d
        win_from = win_from_30d
    else:
        act_blocks = min(args.activity_blocks, blocks_30d)
        win_from = max(0, head - act_blocks)

    act_days = act_blocks * avg / 86400 if act_blocks else 0
    print(f"BSC head={head}  block-time~{avg:.3f}s  ventana30d~{blocks_30d:,} bloques")
    if not args.skip_activity:
        print(f"Ventana actividad: {act_blocks:,} bloques (~{act_days:.1f}d)"
              f"  (usa --full-30d para 30d completos)")

    targets = {args.only: REGISTRIES[args.only]} if args.only else REGISTRIES
    results = []
    for key, cfg in targets.items():
        print(f"\n== {cfg['label']} ==")
        results.append(probe_registry(
            rpc, rpc_logs, key, cfg, head, win_from,
            args.official_sample, args.card_workers, args.skip_activity,
        ))

    out_dir = Path(__file__).resolve().parent.parent / "output"
    out_dir.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    csv_path = out_dir / f"agents_{stamp}.csv"
    md_path = out_dir / f"summary_{stamp}.md"
    write_csv(csv_path, results)
    write_summary(md_path, results, {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "head": head, "avg": avg, "blocks_30d": blocks_30d,
        "win_from": win_from, "act_days": act_days,
    })

    print(f"\nCSV     -> {csv_path}")
    print(f"Resumen -> {md_path}")
    # Eco del veredicto en consola
    grand = sum(len(r["rows"]) for r in results)
    seed = sum(summarize(r)["seed"] for r in results)
    print(f"\nGate: {gate_verdict(grand)}  |  catalogo semilla = {seed}")


if __name__ == "__main__":
    main()
