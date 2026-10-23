# Original raster fixtures

original-colors.jpg and original-colors.webp are original 3 × 2 pixel images,
generated locally for browser decoding tests. There are no external source images,
third-party copyrights, metadata, or personal data. Both contain these RGB colors:

(27,83,73), (230,192,114), (146,68,48),
(243,245,233), (52,112,97), (188,209,201).

They were encoded with Pillow as JPEG (quality 90, subsampling 0) and lossless WebP.
Pillow is only a fixture-generation tool, not a runtime or test dependency.
The corrupt PNG case is generated in export.test.mjs: valid PNG chunks/checksums
and dimensions, but an intentionally invalid IDAT compressed payload. It exercises
bounded pixel-stream validation. Some browsers accept a PNG header even when its
IDAT data is corrupt, so native image.decode() is an additional check, not the
only integrity gate.
