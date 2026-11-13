#!/usr/bin/env python3
"""Read-only-ish check of installed Ollama models, one at a time: capabilities, context length, digest, one generation, peak RAM.
Run ON the AI server:  python3 model-basic-check.py tag1 tag2 ...   Each model is unloaded (keep_alive 0) before the next."""
import json, subprocess, sys, time, urllib.request

BASE = "http://127.0.0.1:11434"


def call(path, body=None, timeout=900):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def mem_used_mb():
    d = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo")}
    return (d["MemTotal"] - d["MemAvailable"]) // 1024


for tag in sys.argv[1:]:
    print("=" * 70, "\n" + tag)
    info = call("/api/show", {"model": tag})
    mi = info.get("model_info", {})
    ctx = {k: v for k, v in mi.items() if k.endswith("context_length")}
    print("capabilities:", info.get("capabilities"), "| context:", ctx, "| params:", info.get("details", {}).get("parameter_size"), info.get("details", {}).get("quantization_level"))
    tags = {m["name"]: m["digest"] for m in call("/api/tags")["models"]}
    print("digest:", tags.get(tag))
    base = mem_used_mb()
    t0 = time.time()
    r = call("/api/generate", {"model": tag, "prompt": "Reply in one short sentence: what can you help a VOLTA.LK shopper with?", "stream": False, "think": False, "options": {"num_ctx": 4096, "num_predict": 60, "temperature": 0.2}, "keep_alive": "2m"})
    wall = time.time() - t0
    ps = call("/api/ps")["models"]
    peak = mem_used_mb()
    ev = r.get("eval_count", 0) / max(r.get("eval_duration", 1) / 1e9, 1e-9)
    print(f"reply: {r.get('response', '').strip()[:160]!r}")
    print(f"load={r.get('load_duration', 0) / 1e9:.1f}s prompt_eval={r.get('prompt_eval_duration', 0) / 1e9:.2f}s gen={ev:.1f} tok/s wall={wall:.1f}s")
    print(f"ollama ps: {[(m['name'], round(m['size'] / 1e9, 2), round(m.get('size_vram', 0) / 1e9, 2)) for m in ps]}  host RAM used {base} -> {peak} MB")
    call("/api/generate", {"model": tag, "keep_alive": 0})
    time.sleep(2)
    print("unloaded; loaded now:", [m["name"] for m in call("/api/ps")["models"]], "| RAM used", mem_used_mb(), "MB")
