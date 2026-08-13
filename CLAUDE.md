@AGENTS.md

# Estado del proyecto

**Terminado.** Sin trabajo pendiente para el hackathon.

- **Producto:** KaizenScope — marketplace de agentes ERC-8004 en BNB Smart Chain, hire vía x402.
- **Desplegado:** [bnb-agent-marketplace.vercel.app](https://bnb-agent-marketplace.vercel.app)
- **Repo:** [github.com/kaizenbnb/bnb-agent-marketplace](https://github.com/kaizenbnb/bnb-agent-marketplace)
- **Flujo hire:** completo end-to-end. La wallet del comprador (RainbowKit/wagmi) firma la autorización Permit2 client-side — el servidor nunca ve ni necesita la clave privada del pagador, solo la firma resultante. 402 → firma → ejecución del trabajo onchain → captura de pago condicional al éxito del trabajo → dos tx hashes devueltos (pago + trabajo), verificables en BscScan.

## Alcance futuro (documentado en README, no bloqueante)

1. **Wallet por agente.** Los 4 agentes comparten una única wallet agentic (`0x5bc1C0779fC435f5C8Dd2692E667e51716e1e9fb`); una wallet por agente es el siguiente paso de infraestructura, no hecho.
2. **Tabla comparativa.** Hoy 1 agente verificado por categoría (4 total); la vista de comparación con varios agentes por categoría es el siguiente paso una vez existan más agentes DeFi-nativos que comparar.

Ver [README.md](README.md) y [docs/USAGE.md](docs/USAGE.md) para el detalle completo (arquitectura, decisiones de ingeniería, guía de operación).
