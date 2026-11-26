# Sample footage for template previews

The moving previews on the template cards (`public/tpl/*.mp4`) are made by `scripts/template-previews.py`.
With nothing in this folder it draws animated sample scenes (colours, light, emoji – no real people).

For real-looking previews, put 10–20 short **license-free** clips here (for example from pexels.com or
pixabay.com – free for commercial use, no attribution needed). Start each file name with a scene word so
the right templates use it:

`city` `party` `street` `beach` `mountains` `nature` `food` `gym` `diya` `holi` `cake` `flowers` `dull` `pastel`

e.g. `beach-surfer.mp4`, `food-noodles.mp4`, `party-friends-2.mp4`. Vertical (9:16) clips look best.
Avoid clips where a recognisable person is the main subject unless the licence allows it in ads/promos.

Then build and serve the app on port 8765 and run:

    python3 scripts/template-previews.py

Commit the new files in `public/tpl/` (the footage itself can stay out of git if you prefer).
