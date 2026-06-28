# trader-frontend

## Run in local


> Without server

```
yarn dev --host 0.0.0.0 --port 5000
```


```
VITE_ENV=production yarn dev --host 0.0.0.0 --port 5000
```

## Local Debug Server

Set `TRAE_LOCAL_DEBUG=1` to start the Trae local debug endpoint together with the Vite dev server.

```bash
TRAE_LOCAL_DEBUG=1 yarn dev --host 0.0.0.0 --port 5000
```

Optional environment variables:

- `TRAE_DEBUG_SESSION_ID`: debug session id, default `local-dev-debug`
- `TRAE_DEBUG_PORT`: debug server start port, default `7777`
- `TRAE_DEBUG_OUTDIR`: debug log directory, default `.dbg`
- `TRAE_DEBUG_IDLE_SECONDS`: auto exit after idle seconds, default `0` for always on
- `TRAE_DEBUG_REMOTE`: set to `1` to listen on `0.0.0.0`

Example:

```bash
TRAE_LOCAL_DEBUG=1 \
TRAE_DEBUG_SESSION_ID=options-local \
TRAE_DEBUG_IDLE_SECONDS=0 \
yarn dev --host 0.0.0.0 --port 5000
```
