# README Addendum - Phase 16-5

## Mini PC Runtime Hardening / Auto Start Strategy

Phase 16-5 documents how AI Memory Gateway should be hardened for 24-hour Mini PC operation.

Recommended order:

```txt
1. Manual runtime verification
2. Windows Task Scheduler auto-start
3. PM2 or NSSM only after stable operation
```

Do not finalize auto-start until the Mini PC has passed actual runtime verification.

Main guide:

```txt
docs/AI_Memory_Gateway_Phase16_5_Mini_PC_Runtime_Hardening_Auto_Start_Strategy.md
```
