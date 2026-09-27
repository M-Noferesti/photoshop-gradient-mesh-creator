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

function gradientMeshFitLayer(layer, destination) {
    var bounds = layer.bounds;
    var layerWidth = bounds[2].as("px") - bounds[0].as("px");
    var layerHeight = bounds[3].as("px") - bounds[1].as("px");
    var documentWidth = destination.width.as("px");
    var documentHeight = destination.height.as("px");
    if (layerWidth <= 0 || layerHeight <= 0) return;
    var scale = Math.min(1, documentWidth * 0.96 / layerWidth, documentHeight * 0.96 / layerHeight);
    if (scale < 1) layer.resize(scale * 100, scale * 100, AnchorPosition.MIDDLECENTER);
    bounds = layer.bounds;
    var centerX = (bounds[0].as("px") + bounds[2].as("px")) / 2;
    var centerY = (bounds[1].as("px") + bounds[3].as("px")) / 2;
    layer.translate(UnitValue(documentWidth / 2 - centerX, "px"), UnitValue(documentHeight / 2 - centerY, "px"));
}

function gradientMeshPlaceEditable(filePath, marker, fitToDocument) {
    try {
        if (app.documents.length === 0) return "ERROR:Open a Photoshop document first.";
        if (!/^GM-[A-Za-z0-9-]+$/.test(marker)) return "ERROR:Invalid mesh layer marker.";
        var imageFile = new File(filePath);
        if (!imageFile.exists) return "ERROR:Rendered PNG was not found.";
        var destination = app.activeDocument;
        var descriptor = new ActionDescriptor();
        descriptor.putPath(charIDToTypeID("null"), imageFile);
        descriptor.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
        descriptor.putUnitDouble(charIDToTypeID("Wdth"), charIDToTypeID("#Prc"), 100);
        descriptor.putUnitDouble(charIDToTypeID("Hght"), charIDToTypeID("#Prc"), 100);
        executeAction(charIDToTypeID("Plc "), descriptor, DialogModes.NO);
        var layer = destination.activeLayer;
        layer.name = "Gradient Mesh [" + marker + "]";
        if (fitToDocument) gradientMeshFitLayer(layer, destination);
        return "OK:" + marker;
    } catch (e) {
        return "ERROR:" + e.message;
    }
}

function gradientMeshActiveMarker() {
    try {
        if (app.documents.length === 0) return "ERROR:Open a Photoshop document first.";
        var layer = app.activeDocument.activeLayer;
        if (layer.kind !== LayerKind.SMARTOBJECT) return "ERROR:Select an editable Gradient Mesh Smart Object layer.";
        var match = layer.name.match(/\[(GM-[A-Za-z0-9-]+)\]$/);
        return match ? "OK:" + match[1] : "ERROR:Select an editable Gradient Mesh layer.";
    } catch (e) {
        return "ERROR:" + e.message;
    }
}

function gradientMeshReplaceEditable(filePath, marker) {
    try {
        var active = gradientMeshActiveMarker();
        if (active !== "OK:" + marker) return "ERROR:Select the linked Gradient Mesh layer to update it.";
        var imageFile = new File(filePath);
        if (!imageFile.exists) return "ERROR:Rendered PNG was not found.";
        var descriptor = new ActionDescriptor();
        descriptor.putPath(charIDToTypeID("null"), imageFile);
        executeAction(stringIDToTypeID("placedLayerReplaceContents"), descriptor, DialogModes.NO);
        app.activeDocument.activeLayer.name = "Gradient Mesh [" + marker + "]";
        return "OK:Updated linked Gradient Mesh layer.";
    } catch (e) {
        return "ERROR:" + e.message;
    }
}
