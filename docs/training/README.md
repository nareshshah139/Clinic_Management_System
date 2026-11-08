# Clinic workflows training guide

`clinic-workflows-guide.pdf` teaches reception staff and doctors the booking, consultation and pharmacy hand-off workflows. It covers nine lessons with practice tasks and an answer key. Every picture is a screenshot of the running app.

## Rebuild it

The app must be running, with the frontend on port 3000, the API on port 4000 and the seed users loaded.

```sh
node docs/training/capture.cjs        # drives the app, asserts each workflow, writes img/ and manifest.json
node docs/training/build.cjs          # guide.src.html + manifest.json -> clinic-workflows-guide.pdf
python3 docs/training/verify_pdf.py   # A4, fonts, no blank pages, no test names; sets PDF metadata
```

`capture.cjs` exits non-zero if any workflow check fails, and the guide prints the pass count on the quick-reference page. To retake one part, run `node docs/training/capture.cjs partA`, `partB`, `partC` or `partD`. `partB` needs the booking that `partA` makes.

## How it fits together

- `capture.cjs` pins each browser's clock to a morning on one clinic day, because the app decides "today" and "past slot" from the browser clock in IST. It seeds a background schedule through the API, then books, consults and completes through the UI. It records each callout's box next to its screenshot.
- `guide.src.html` is the guide's text. `<figure data-shot="id" data-w="mm" data-crop="x,y,w,h">` places a screenshot with its numbered callouts, and `{{key}}` inserts a value the capture recorded.
- `build.cjs` draws the callouts as vector boxes, fills in the contents page numbers, fails on any page that overflows A4, and prints the PDF with Chromium.
- `fonts/` holds Inter as TrueType-flavoured WOFF2 under the SIL Open Font License. The system Inter is CFF, which Chromium embeds as Type 3 glyphs with uneven spacing.
