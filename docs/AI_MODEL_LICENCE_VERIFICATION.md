# Three-model licence and tag verification

Date: 2026-11-13. Written for: the project owner. Nothing here is a production approval.

Sources: Ollama registry manifests (`registry.ollama.ai/v2/library/<model>/manifests/<tag>`, including the embedded licence layer), the Ollama library tag pages, and the Hugging Face model cards/API. Sizes are the real layer sizes from the manifests.

| | A: Qwen3.5-9B | B: Gemma 4 E4B | C: Qwen3.5-4B |
|---|---|---|---|
| Exact Ollama tag used | `qwen3.5:9b-q4_K_M` | `gemma4:e4b-it-q4_K_M` | `qwen3.5:4b-q4_K_M` |
| Also exists unqualified | `qwen3.5:9b` (same blobs) | `gemma4:e4b` (same blobs) | `qwen3.5:4b` (same blobs) |
| Quantisation | Q4_K_M | Q4_K_M | Q4_K_M |
| Parameters (config) | 9.0 B | 7.5 B (E4B: about 4B effective, per-layer embeddings counted in the total) | 4.2 B |
| Download size | 6.55 GB (weights 5.63 GB + vision projector 0.92 GB) | 6.58 GB (weights 5.49 GB + projector 0.99 GB + 0.10 GB draft model) | 3.32 GB (weights 2.65 GB + projector 0.68 GB) |
| Licence in the Ollama package | Apache-2.0 (full text, 11,343 bytes) | Apache-2.0 (full text, 11,355 bytes) | Apache-2.0 (same layer as A) |
| Licence on upstream card | `apache-2.0` (Qwen/Qwen3.5-9B, not gated) | `apache-2.0` (google/gemma-4-E4B-it, not gated) | `apache-2.0` (Qwen/Qwen3.5-4B, not gated) |
| Commercial hosted service | Permitted by Apache-2.0 (keep licence and notices) | Permitted by Apache-2.0 | Permitted by Apache-2.0 |
| Image input | Yes (vision projector shipped; upstream pipeline image-text-to-text) | Yes (projector; any-to-any upstream) | Yes (projector) |
| Audio input | No evidence | Upstream lists any-to-any; **Ollama audio support is verified only by testing after install** | No evidence |
| Tool calling | To be verified by `ollama show` capabilities and by test | same | same |
| Context length | To be read from `ollama show` after install (do not assume) | same | same |
| Default sampling in package | temperature 1, top_k 20, top_p 0.95, presence_penalty 1.5 | temperature 1, top_k 64, top_p 0.95 | same as A |

## Findings

- **All three are Apache-2.0 in both places checked, so none is excluded on licence.** One caution: an earlier registry entry for Gemma used Google's custom terms. The Gemma 4 package and card now say Apache-2.0, and I read both; the Gemma 3 and earlier terms still apply to those older models, which stay excluded.
- Capabilities differ: the three are not interchangeable. Qwen3.5 packages ship a vision projector, so image support is expected but not yet tested. Audio is claimed only for Gemma 4 E4B and unproven in Ollama.
- The Qwen3.5 package defaults (temperature 1, presence_penalty 1.5) are chat defaults; the Agent sends its own options, so benchmarks must use the Agent's options, not the defaults.
- Any tag not in this table is not approved. The Agent's own allow-list (`apps/agent/src/ollama/models.ts`) still permits only the two vetted Qwen3 tags; adding these three to production is a separate code change and approval.

## Still to verify after install

`ollama show` for context length, capabilities and the digest; a tool-call test; an image test; an audio test for Gemma (Sinhala audio separately, with native samples).
