#target photoshop

function gradientMeshDocumentInfo() {
    try {
        if (app.documents.length === 0) return "ERROR:Open a Photoshop document first.";
        var doc = app.activeDocument;
        return "OK:" + Math.round(doc.width.as("px")) + "|" + Math.round(doc.height.as("px"));
    } catch (e) {
        return "ERROR:" + e.message;
    }
}

function gradientMeshForegroundColor() {
    try {
        return "OK:#" + app.foregroundColor.rgb.hexValue;
    } catch (e) {
        return "ERROR:" + e.message;
    }
}

function gradientMeshPlace(filePath, fitToDocument) {
    var source = null;
    try {
        if (app.documents.length === 0) return "ERROR:Open a Photoshop document first.";
        var destination = app.activeDocument;
        var imageFile = new File(filePath);
        if (!imageFile.exists) return "ERROR:Rendered PNG was not found.";
        source = app.open(imageFile);
        var layer = source.activeLayer.duplicate(destination, ElementPlacement.PLACEATBEGINNING);
        layer.name = "Gradient Mesh";
        source.close(SaveOptions.DONOTSAVECHANGES);
        source = null;
        app.activeDocument = destination;
        if (fitToDocument) {
            var bounds = layer.bounds;
            var layerWidth = bounds[2].as("px") - bounds[0].as("px");
            var layerHeight = bounds[3].as("px") - bounds[1].as("px");
            var documentWidth = destination.width.as("px");
            var documentHeight = destination.height.as("px");
            if (layerWidth > 0 && layerHeight > 0) {
                var scale = Math.min(1, documentWidth * 0.96 / layerWidth, documentHeight * 0.96 / layerHeight);
                if (scale < 1) layer.resize(scale * 100, scale * 100, AnchorPosition.MIDDLECENTER);
                bounds = layer.bounds;
                var centerX = (bounds[0].as("px") + bounds[2].as("px")) / 2;
                var centerY = (bounds[1].as("px") + bounds[3].as("px")) / 2;
                layer.translate(UnitValue(documentWidth / 2 - centerX, "px"), UnitValue(documentHeight / 2 - centerY, "px"));
            }
        }
        return "OK:Added Gradient Mesh layer.";
    } catch (e) {
        try { if (source) source.close(SaveOptions.DONOTSAVECHANGES); } catch (ignore) {}
        return "ERROR:" + e.message;
    }
}
