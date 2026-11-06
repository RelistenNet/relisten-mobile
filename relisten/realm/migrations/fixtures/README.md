# Released schema-16 fixture

`schema_16.json` contains Realm's serialized schema definitions exported from
`codex/ios-player-refinement`, commit
`3e7d26165147db8e443c46f381d8b7651706f0bd`, with `schemaVersion: 16`.
It is independent of the current schema. Do not regenerate it from today's models.

`catalog_migration.test.ts` creates a version-16 Realm on disk using those
schemas, seeds representative records with the released fields, closes it, and
opens it through the real current migration and startup configuration. The test
checks catalog reads, imported identities, queue occurrences/checkpoint, history,
anonymous favorites, and the downloaded file's path and byte digest.

`offline_sample.mp3` is a generated 0.25-second silent audio fixture. It contains
no music or external recording:

    ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.25 -codec:a libmp3lame -q:a 9 offline_sample.mp3

Simulator playback uses a separately generated 60-second version so the saved
42-second checkpoint can resume inside the file's duration.
