# systemd units

Deployment units for the atradio.fm API. Two services split the combined
`apps/api` entrypoint so they can be scaled/restarted independently:

- **`atradio-api.service`** — the Express server (XRPC read API + TuneIn/ICY
  media proxies), `bun run start:server`.
- **`atradio-jetstream.service`** — the Jetstream consumer that indexes
  `fm.atradio.*` records into Postgres, `bun run start:consumer`.

Both read config from `apps/api/.env` (loaded via dotenv).

## Install

Adjust `WorkingDirectory` / `User` / `HOME` to your host, then:

```bash
sudo cp systemd/atradio-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now atradio-api atradio-jetstream
```

## Operate

```bash
systemctl status atradio-api atradio-jetstream
journalctl -u atradio-jetstream -f      # follow the firehose consumer
sudo systemctl restart atradio-api
```
