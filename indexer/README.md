# indexer — sondeo ERC-8004 en BSC

Censo de agentes ERC-8004 en BSC mainnet para el **gate de la Semana 1**.
Lee Identity + Reputation Registry de dos implementaciones (oficial `0x8004…` y
BRC8004) vía RPC público y mide, por agente: **(a)** AgentCard resoluble,
**(b)** feedback onchain, **(c)** actividad en 30 días.

## Uso

```bash
cd indexer
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
python probe_erc8004.py
```

Salidas en `../output/`:
- `agents_<fecha>.csv` — una fila por agente (el catálogo semilla sale de filtrar
  `card_resolvable=True` **y** `feedback_count>0`).
- `summary_<fecha>.md` — totales a/b/c por registro y **veredicto del gate**.

### Opciones

| Flag | Efecto |
|---|---|
| `--only brc8004` / `--only official` | analizar un solo registro |
| `--official-sample N` | tamaño de muestra del registro no enumerable (def. 40) |
| `--skip-activity` | omite el escaneo de la ventana 30d (mucho más rápido) |
| `--card-workers N` | concurrencia del fetch de AgentCards (def. 8) |
| `--rpc URL` | añade un RPC (repetible) |

## Notas de diseño

- **BRC8004** es enumerable (`totalSupply`/`tokenByIndex`) → censo completo.
- **Oficial `0x8004A169…`** NO expone `totalSupply` (revierte) → se **muestrea**
  por eventos `Registered`, no se barre la cadena entera.
- Los registros son **proxies EIP-1967**; se usa el ABI estándar ERC-721 +
  interfaz ERC-8004, no el bytecode del proxy (ver AGENT_LOG.md).
- Solo RPC públicos, cero secretos. El fetch de AgentCards valida el host
  (bloquea localhost/IPs privadas — anti-SSRF) y limita tamaño/tiempo.
- "Sin recortes silenciosos": si un escaneo de logs toca el tope de chunks, se
  marca como truncado en el resumen.
