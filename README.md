# Vintage PC Games

Browser games in the spirit of classic 1990s PC game genres, each in its own folder.

**Play:** https://apullenb.github.io/vintage-pc-games/

| Game | Folder | Genre |
| --- | --- | --- |
| [Groundhogs](https://apullenb.github.io/vintage-pc-games/groundhogs/) | [`groundhogs/`](groundhogs/) | Guide a stream of walking groundhogs home by assigning them jobs |

## Running a game

Each game is a standalone Vite + TypeScript app:

```bash
cd groundhogs
npm install
npm run dev
```

Pushing to `main` runs every game's tests (including scripted proofs that each Groundhogs level is winnable) and deploys to GitHub Pages.
