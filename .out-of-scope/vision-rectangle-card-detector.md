# Vision's rectangle detector for the card outline

The card detector does not use Vision's `VNDetectRectanglesRequest` to find the card outline. It does not replace the edge refiner, and it does not give the first rough outline either. The detector keeps the document proposal (`VNDetectDocumentSegmentationRequest`) and the luma edge refiner from #10.

## Why this is out of scope

#421 tried the rectangle detector as the whole detector, with the orientation fixed (#10's earlier trials had passed the wrong orientation). It ran on the same luma buffer as the current detector, with aspect bounds of 63:88 ± 0.02. The owner then scanned the same cards on the iPhone with each detector, and the training crops were measured against Scryfall's image of each card printing. The results are in the comments on #421.

- **The fit is no better.** The median size error was 0.53 mm for the trial and 0.40 mm for the current detector.
- **Its failures are the harmful kind.** On a black-bordered card it outlined the inner frame, 3.7 by 5.4 mm too small. The crop lost the border and the collector line, and recognition failed. The current detector's large errors were all too large: the whole card stayed in the crop, and recognition still worked.
- **It is slower.** On the Mac, its p95 was 50 to 114 ms against 11 to 34 ms for the current detector. The device budget is p95 below 20 ms at 4.5 Hz.
- **It does not settle on patterned surfaces.** With a card on a patterned surface, the outline kept moving.

The edge refiner's rule that the outermost valid lines win is what keeps an outline off the inner frame. A generic rectangle detector has no such rule, so its errors fall on the side that loses the collector line.

#486 proposed a hybrid: the rectangle detector for the first rough outline only, then the edge refiner. It was closed too. The fit gain it would chase was not measured, and running the rectangle request and then the refiner on every frame puts the 20 ms budget at risk.

## Prior requests

- #421: "Try Vision's rectangle detector for the card outline, with the correct orientation" (the trial)
- #486: "Try Vision's rectangle detector as the card detector's coarse proposal, with the edge refiner"
