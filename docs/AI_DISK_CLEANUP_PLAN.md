# Disk cleanup plan (preparation only: nothing has been deleted)

Status: **a plan plus a read-only inventory script.** I have no login to either server, so I could not measure disk usage: every size below that is not marked "reported earlier" is unknown until the inventory runs. No file, image, model, volume or log was deleted, and the script I wrote deletes nothing.

Written for: the project owner, who will run the inventory and approve any deletion.

## 1. What is known (from earlier sessions, not re-measured today)

| Fact | Source |
|---|---|
| The **website server** disk was 91% to 100% full several times and broke image builds; after the last build and prune it stood at **93% with about 2.6 GB free** | Reported during the deployments |
| The Docker **build cache** grows with every web image build and was pruned (`docker builder prune -f`) after each | Reported during the deployments |
| Rollback images are tagged `volta/web:rollback-*`; the newest, `volta/web:rollback-ai-widget-4`, is the image to return to if the current deployment (commit `531cd1c`) goes wrong | Deployment notes |
| A project called Ceylora was removed from the website server at your instruction; its backup is at `/root/ceylora-final-backup` (and a copy at `E:\ceylora-backup-20261112`) | Earlier session |
| The **AI server** holds Ollama models: the live `qwen3:1.7b-q4_K_M`, the Sinhala model, and larger models pulled for the benchmark: Qwen3-4B (two variants) and `qwen2.5:3b-instruct`, together roughly **5 GB** | Reported earlier |

## 2. Step 1: run the inventory (read-only)

`tools/ops/disk-inventory.sh` lists filesystems, the biggest directories, Docker usage, images (with the ones containers use and the rollback ones marked), volumes, Ollama models, logs and caches, backup folders and large files. It contains no deletion, prune, stop or write command (checked: only `df`, `du`, `docker ... ls/df/images/ps`, `ollama list`, `journalctl --disk-usage`, `ls`, `find` and one local `curl` GET).

```
sudo bash tools/ops/disk-inventory.sh | tee /tmp/disk-inventory.txt
```
Run it once on each server, then send me the output (it holds paths and image names, no secrets). I will fill the table in section 4 with real numbers and compute the recoverable space.

## 3. Protected: never a cleanup candidate

| Protected item | Why |
|---|---|
| Docker **volumes**, above all the Postgres data and the uploads/media volumes | Customer accounts, orders and uploaded images |
| Images used by **running containers** (`docker ps -a` list in the inventory) | The live site and its tunnel |
| The **two newest rollback images** (at least `volta/web:rollback-ai-widget-4`) | The way back from a bad deployment; also needed to test a rollback |
| `/opt/valta` (compose file, environment files, `ai-tunnel/` key and pinned host key), `/opt/volta-agent`, `/etc/volta-agent` | Configuration and secrets |
| `/etc/letsencrypt` | Certificates (valid to 21 Jan 2027) |
| Backups: `/root/ceylora-final-backup`, any database dumps, `/var/backups` | Recovery; Ceylora's backup should be deleted only when you say you no longer need it |
| The loaded live model `qwen3:1.7b-q4_K_M` and the Sinhala model | The Agent depends on them |
| Anything you have not told me is disposable | Default is keep |

## 4. Candidates, in order of safety (to be filled in from the inventory)

| # | Candidate | Expected effect | Needs approval | How to verify first | Space (to measure) |
|---|---|---|---|---|---|
| 1 | Docker **build cache** | Next builds are slower once; nothing running changes | Yes | `docker builder du` | ? |
| 2 | **Dangling** images (untagged) | None | Yes | `docker images -f dangling=true` | ? |
| 3 | **Old rollback images**, keeping the newest two | Fewer rollback points | Yes; you decide how many to keep | Compare names and ages in the inventory against the deployment log; confirm the running image is not among them | ? |
| 4 | Journal and old logs (vacuum to a size or age) | Older logs gone | Yes | `journalctl --disk-usage`, `/var/log` sizes | ? |
| 5 | **Unused models** on the AI server | See below | Yes, separate | `ollama list`, `/api/ps` | about 5 GB total (reported earlier), per-model sizes to measure |
| 6 | `apt` cache and leftover temporary files under `/tmp` | None | Yes | `du` of both | ? |
| 7 | The Ceylora backup | Loses the only copy on the server (a copy exists on your PC) | **Separate, explicit** | Confirm the copy on your PC opens | ? |

Model candidates (item 5), decided by what the project still needs:
- `qwen2.5:3b-instruct`: **licence forbids commercial use** and it was removed from the candidates; no further use. Safe to remove when you approve.
- Two Qwen3-4B variants: only `qwen3:4b-instruct-2507` is an experimental candidate; keep **one** (the instruct-2507 variant) if you still plan the accuracy comparison, and the other is a duplicate. Removing models is reversible only by downloading them again, so wait for the benchmark decision first.
- `qwen3:1.7b-q4_K_M` and the Sinhala model: keep.

## 5. Verify backup and rollback dependencies before any deletion

1. List the running images and confirm none will be removed (`docker ps -a` section of the inventory).
2. Confirm the latest rollback image exists and starts: `docker image inspect volta/web:rollback-ai-widget-4` (read-only).
3. Confirm a current database backup exists and you know how to restore it (none is documented in this repository: say so if there is none, and make one before cleanup).
4. Note the free space before and after each step.

## 6. Proposed order once you approve (commands to be reviewed, none run)

Each step is its own approval. Use the "dry" form first where one exists.
1. `docker builder prune -f` (removes only unused build cache).
2. `docker image prune -f` (dangling images only; it does **not** remove tagged images or those used by containers).
3. Remove named old rollback images, one by one, **by exact tag** that you approve (`docker rmi volta/web:rollback-<name>`), never with a wildcard.
4. `journalctl --vacuum-size=<size>` and clearing `/var/cache/apt` (`apt-get clean`).
5. Models, only after the benchmark decision: `ollama rm <exact-tag>` for each approved tag.

Stop at any step that does not free what was expected or that surprises you.

## 7. After cleanup

Re-run the inventory, record free space, check the site and the assistant still work (`/`, a product page, the private preview chat), and keep the before and after numbers. Add a recurring check (for example weekly) because the website server fills quickly with every build.

## 8. What I need from you

The inventory output from both servers, a yes or no on each candidate class, how many rollback images you want to keep, whether a database backup exists, and when the Ceylora backup may go.
