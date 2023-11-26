# ydisarc

Script to download entire folders from Yandex disk.

Will check SHA256 for downloaded files. Can save SHA256 in checkable by sha256sum format.

Will automatically translate cyrillic names (from `привет` to `privet`) when hit 256 byte limit on file name (mostly fine, buy still possible to overflow with repeated `щ` -> `sch`).

Example usage:

```bash
deno run ya.ts https://disk.yandex.ru/d/XXXXXXXXXXXXXX
```

```
$> deno run ya.ts -h
usage: deno run %file%.ts [-a] URL [OUTPUT]
  URL
    url for dist to download
  OUTPUT
    output folder
    
  -a, --check-sha256-for-already-existing-files
    Recheck sha256 for already downloaded files, when script rerun.
  -n, --only-print-hash
    Do not download files, only print SHA256 hashes
```
