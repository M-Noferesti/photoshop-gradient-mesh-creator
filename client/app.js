(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("preview"), ctx = canvas.getContext("2d");
  var colors = [], edges = [], selected = { kind: "color", index: 4 };
  var dragging = null, sampling = false, renderQueued = false, paletteIndex = 0;
  var palettes = [
    ["#fc7279", "#fdad78", "#e8c57f", "#b583cc", "#f47c91", "#ed8e82", "#766fc1", "#b384cc", "#e9a6b1"],
    ["#1f7b9d", "#58b8a9", "#c8e6ae", "#565cbd", "#77bacd", "#ffd48a", "#282b75", "#bc87b7", "#f89388"],
    ["#e85a72", "#f49b65", "#ffd890", "#872e80", "#dd6192", "#fcb780", "#344f9a", "#9c62bb", "#ed8697"]
  ];
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function hexToRgb(hex) {
    var number = parseInt(hex.slice(1), 16);
    return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
  }
  function rgbToHex(rgb) {
    return "#" + rgb.map(function (n) { return ("0" + n.toString(16)).slice(-2); }).join("");
  }
  function validHex(value) { return /^#[0-9a-fA-F]{6}$/.test(value); }
  function setStatus(message, error) {
    $("status").textContent = message;
    $("status").className = error ? "status error" : "status";
  }
  function makeColors(size, palette) {
    var result = [];
    for (var row = 0; row < size; row++) for (var col = 0; col < size; col++) {
      var paletteIndex = Math.round(row * 2 / (size - 1)) * 3 + Math.round(col * 2 / (size - 1));
      result.push({ x: .18 + .64 * col / (size - 1), y: .18 + .64 * row / (size - 1), color: palette[paletteIndex] });
    }
    return result;
  }
  function makeShape(name) {
    var result = [];
    if (name === "rectangle") {
      result = [{x:.06,y:.06},{x:.94,y:.06},{x:.94,y:.94},{x:.06,y:.94}];
    } else if (name === "diamond") {
      result = [{x:.5,y:.06},{x:.94,y:.5},{x:.5,y:.94},{x:.06,y:.5}];
    } else {
      for (var i = 0; i < 8; i++) {
        var angle = -Math.PI / 2 + i * Math.PI / 4;
        var radius = name === "blob" ? .39 + .05 * Math.sin(i * 2.3 + .7) : .44;
        result.push({x:.5 + radius * Math.cos(angle), y:.5 + radius * Math.sin(angle)});
      }
    }
    setAutomaticTangents(result);
    return result;
  }
  function setAutomaticTangents(points) {
    points.forEach(function (point, index) {
      var previous = points[(index - 1 + points.length) % points.length];
      var next = points[(index + 1) % points.length];
      point.out = {x:(next.x - previous.x) / 6,y:(next.y - previous.y) / 6};
      point.in = {x:-point.out.x,y:-point.out.y};
    });
  }
  function safetyMargin() { return .02 + Number($("feather").value) * .03; }
  function shapeBounds(points) {
    var bounds = {minX:1,maxX:0,minY:1,maxY:0};
    points.forEach(function (point) {
      bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y);
    });
    return bounds;
  }
  function remapColors(from, to) {
    var oldWidth = Math.max(.001, from.maxX - from.minX), oldHeight = Math.max(.001, from.maxY - from.minY);
    var newWidth = to.maxX - to.minX, newHeight = to.maxY - to.minY;
    colors.forEach(function (point) {
      point.x = to.minX + (point.x - from.minX) / oldWidth * newWidth;
      point.y = to.minY + (point.y - from.minY) / oldHeight * newHeight;
    });
  }
  function fitShapeInsideFeather() {
    var margin = safetyMargin(), bounds = {minX:1,maxX:0,minY:1,maxY:0};
    function include(x, y) {
      bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
    }
    edges.forEach(function (point) {
      include(point.x, point.y);
      if ($("smoothEdges").checked) {
        include(point.x + point.in.x, point.y + point.in.y);
        include(point.x + point.out.x, point.y + point.out.y);
      }
    });
    var available = 1 - 2 * margin;
    var scale = Math.min(1, available / Math.max(.001, bounds.maxX - bounds.minX), available / Math.max(.001, bounds.maxY - bounds.minY));
    var centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
    edges.forEach(function (point) {
      point.x = centerX + (point.x - centerX) * scale;
      point.y = centerY + (point.y - centerY) * scale;
      point.in.x *= scale; point.in.y *= scale;
      point.out.x *= scale; point.out.y *= scale;
    });
    bounds = {minX:1,maxX:0,minY:1,maxY:0};
    edges.forEach(function (point) {
      include(point.x, point.y);
      if ($("smoothEdges").checked) {
        include(point.x + point.in.x, point.y + point.in.y);
        include(point.x + point.out.x, point.y + point.out.y);
      }
    });
    var shiftX = bounds.minX < margin ? margin - bounds.minX : bounds.maxX > 1 - margin ? 1 - margin - bounds.maxX : 0;
    var shiftY = bounds.minY < margin ? margin - bounds.minY : bounds.maxY > 1 - margin ? 1 - margin - bounds.maxY : 0;
    edges.forEach(function (point) { point.x += shiftX; point.y += shiftY; });
  }
  function traceBoundary(target, points, smooth, width, height) {
    var scaled = points.map(function (point) { return {x:point.x * width,y:point.y * height}; });
    var d = "M" + scaled[0].x + " " + scaled[0].y;
    if (target) { target.beginPath(); target.moveTo(scaled[0].x, scaled[0].y); }
    for (var i = 0; i < scaled.length; i++) {
      var p0 = scaled[(i - 1 + scaled.length) % scaled.length];
      var p1 = scaled[i], p2 = scaled[(i + 1) % scaled.length], p3 = scaled[(i + 2) % scaled.length];
      if (smooth) {
        var original1 = points[i], original2 = points[(i + 1) % points.length];
        var a = {x:(original1.x + original1.out.x) * width,y:(original1.y + original1.out.y) * height};
        var b = {x:(original2.x + original2.in.x) * width,y:(original2.y + original2.in.y) * height};
        d += " C" + a.x + " " + a.y + " " + b.x + " " + b.y + " " + p2.x + " " + p2.y;
        if (target) target.bezierCurveTo(a.x, a.y, b.x, b.y, p2.x, p2.y);
      } else {
        d += " L" + p2.x + " " + p2.y;
        if (target) target.lineTo(p2.x, p2.y);
      }
    }
    if (target) target.closePath();
    return d + " Z";
  }
  function updateOverlay() {
    var d = traceBoundary(null, edges, $("smoothEdges").checked, 1000, 1000);
    var markup = '<path class="mesh-boundary" d="' + d + '"/>';
    if (selected.kind === "edge" && $("smoothEdges").checked) {
      var point = edges[selected.index];
      ["in", "out"].forEach(function (side) {
        markup += '<path class="tangent-line" d="M' + point.x * 1000 + ' ' + point.y * 1000 + ' L' + (point.x + point[side].x) * 1000 + ' ' + (point.y + point[side].y) * 1000 + '"/>';
      });
    }
    $("meshOverlay").innerHTML = markup;
  }
  function renderMesh(target, width, height, points, boundary, spread, feather, smooth) {
    var image = target.createImageData(width, height), pixels = image.data;
    var prepared = points.map(function (point) { return {x:point.x,y:point.y,rgb:hexToRgb(point.color)}; });
    var radius = Math.max(.08, spread * .72), inverse = 1 / (2 * radius * radius), offset = 0;
    for (var y = 0; y < height; y++) {
      var ny = y / Math.max(1, height - 1);
      for (var x = 0; x < width; x++) {
        var nx = x / Math.max(1, width - 1), sum = 0, red = 0, green = 0, blue = 0;
        for (var i = 0; i < prepared.length; i++) {
          var p = prepared[i], dx = nx - p.x, dy = ny - p.y;
          var weight = Math.exp(-(dx * dx + dy * dy) * inverse);
          sum += weight;
          red += p.rgb[0] * weight; green += p.rgb[1] * weight; blue += p.rgb[2] * weight;
        }
        pixels[offset++] = Math.round(red / sum);
        pixels[offset++] = Math.round(green / sum);
        pixels[offset++] = Math.round(blue / sum);
        pixels[offset++] = 255;
      }
    }
    target.putImageData(image, 0, 0);
    var mask = document.createElement("canvas");
    mask.width = width; mask.height = height;
    var maskContext = mask.getContext("2d");
    maskContext.fillStyle = "#fff";
    traceBoundary(maskContext, boundary, smooth, width, height);
    maskContext.fill();
    target.save();
    target.globalCompositeOperation = "destination-in";
    if (feather > 0) {
      var blur = Math.max(1, Math.round(Math.min(width, height) * feather / 100));
      target.filter = "blur(" + blur + "px)";
    }
    target.drawImage(mask, 0, 0);
    target.restore();
  }
  function drawHandles() {
    [["color", colors, $("colorHandles")], ["edge", edges, $("edgeHandles")]].forEach(function (group) {
      var kind = group[0], points = group[1], layer = group[2];
      layer.innerHTML = "";
      points.forEach(function (point, index) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "handle " + kind + (selected.kind === kind && selected.index === index ? " selected" : "");
        button.style.left = point.x * 100 + "%";
        button.style.top = point.y * 100 + "%";
        if (kind === "color") button.style.backgroundColor = point.color;
        button.setAttribute("aria-label", (kind === "color" ? "Color" : "Shape") + " point " + (index + 1));
        button.addEventListener("pointerdown", function (event) {
          if (sampling) return;
          selected = {kind:kind,index:index}; dragging = {kind:kind,index:index,handle:null};
          updateSelected();
          $("previewWrap").setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        layer.appendChild(button);
      });
    });
    var tangentLayer = $("tangentHandles");
    tangentLayer.innerHTML = "";
    if (selected.kind === "edge" && $("smoothEdges").checked) {
      var anchor = edges[selected.index];
      ["in", "out"].forEach(function (side) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "handle tangent " + side;
        button.style.left = (anchor.x + anchor[side].x) * 100 + "%";
        button.style.top = (anchor.y + anchor[side].y) * 100 + "%";
        button.setAttribute("aria-label", (side === "in" ? "Incoming" : "Outgoing") + " Bezier handle");
        button.addEventListener("pointerdown", function (event) {
          dragging = {kind:"edge",index:selected.index,handle:side};
          $("previewWrap").setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        tangentLayer.appendChild(button);
      });
    }
  }
  function updateSelected() {
    var point = (selected.kind === "color" ? colors : edges)[selected.index];
    if (!point) return;
    $("pointName").textContent = (selected.kind === "color" ? "COLOR" : "SHAPE") + " POINT " + (selected.index + 1 < 10 ? "0" : "") + (selected.index + 1);
    $("pointCoords").textContent = Math.round(point.x * 100) + "%, " + Math.round(point.y * 100) + "%";
    $("colorEditor").hidden = selected.kind !== "color";
    $("edgeEditor").hidden = selected.kind !== "edge";
    if (selected.kind === "color") {
      $("pointColor").value = point.color;
      $("hexColor").value = point.color.toUpperCase();
    }
    drawHandles();
  }
  function queuePreview() {
    updateOverlay();
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      renderMesh(ctx, canvas.width, canvas.height, colors, edges, Number($("spread").value) / 100, Number($("feather").value), $("smoothEdges").checked);
    });
  }
  function outputDimensions() {
    var width = Number($("outputWidth").value), height = Number($("outputHeight").value);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error("Width and height must be 1–8192 pixels.");
    if (width * height > 16000000) throw new Error("Maximum output is 16 million pixels.");
    return {width:width,height:height};
  }
  function buildPng(callback) {
    var dims;
    try { dims = outputDimensions(); } catch (error) { setStatus(error.message, true); return; }
    setStatus("Rendering " + dims.width + " × " + dims.height + "…");
    $("addLayer").disabled = $("download").disabled = true;
    setTimeout(function () {
      try {
        var output = document.createElement("canvas");
        output.width = dims.width; output.height = dims.height;
        renderMesh(output.getContext("2d"), dims.width, dims.height, colors, edges, Number($("spread").value) / 100, Number($("feather").value), $("smoothEdges").checked);
        callback(output.toDataURL("image/png"));
      } catch (error) { setStatus("Render failed: " + error.message, true); }
      finally { $("addLayer").disabled = $("download").disabled = false; }
    }, 20);
  }
  function evalHost(expression, callback) {
    if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) { setStatus("Open this panel in Photoshop to use this action.", true); return; }
    window.__adobe_cep__.evalScript(expression, callback);
  }
  function deleteSelected() {
    var list = selected.kind === "color" ? colors : edges;
    var minimum = selected.kind === "color" ? 1 : 3;
    if (list.length <= minimum) { setStatus("Keep at least " + minimum + " " + (selected.kind === "color" ? "color" : "shape") + " points.", true); return; }
    list.splice(selected.index, 1);
    selected.index = Math.min(selected.index, list.length - 1);
    if (selected.kind === "edge") $("shape").value = "custom";
    updateSelected(); queuePreview(); setStatus("Point deleted.");
  }
  function setColor(value) {
    if (selected.kind !== "color") return;
    colors[selected.index].color = value.toLowerCase();
    updateSelected(); queuePreview();
  }
  $("grid").addEventListener("change", function () {
    colors = makeColors(Number(this.value), palettes[paletteIndex]);
    selected = {kind:"color",index:Math.floor(colors.length / 2)};
    updateSelected(); queuePreview();
  });
  $("shape").addEventListener("change", function () {
    var previous = shapeBounds(edges);
    edges = makeShape(this.value);
    $("smoothEdges").checked = this.value === "ellipse" || this.value === "blob";
    fitShapeInsideFeather();
    remapColors(previous, shapeBounds(edges));
    selected = {kind:"edge",index:0};
    updateSelected(); queuePreview();
  });
  $("smoothEdges").addEventListener("change", function () { var previous = shapeBounds(edges); fitShapeInsideFeather(); remapColors(previous, shapeBounds(edges)); updateSelected(); queuePreview(); });
  $("spread").addEventListener("input", function () { $("spreadValue").textContent = this.value + "%"; queuePreview(); });
  $("feather").addEventListener("input", function () { var previous = shapeBounds(edges); $("featherValue").textContent = this.value + "%"; fitShapeInsideFeather(); remapColors(previous, shapeBounds(edges)); updateSelected(); queuePreview(); });
  $("pointColor").addEventListener("input", function () { setColor(this.value); });
  $("hexColor").addEventListener("input", function () {
    if (validHex(this.value)) setColor(this.value);
  });
  $("hexColor").addEventListener("change", function () {
    var value = this.value.trim();
    if (value.charAt(0) !== "#") value = "#" + value;
    if (!validHex(value)) { updateSelected(); setStatus("Enter a six-digit hex color, such as #FF758D.", true); return; }
    setColor(value);
  });
  $("previewWrap").addEventListener("pointerdown", function (event) {
    if (!sampling) return;
    var rect = this.getBoundingClientRect();
    var x = clamp(Math.floor((event.clientX - rect.left) * canvas.width / rect.width), 0, canvas.width - 1);
    var y = clamp(Math.floor((event.clientY - rect.top) * canvas.height / rect.height), 0, canvas.height - 1);
    var pixel = ctx.getImageData(x, y, 1, 1).data;
    sampling = false; this.classList.remove("sampling"); $("samplePreview").classList.remove("active");
    if (pixel[3] < 20) { setStatus("Pick inside the colored shape.", true); return; }
    setColor(rgbToHex([pixel[0],pixel[1],pixel[2]]));
    setStatus("Color sampled from preview.");
    event.preventDefault();
  });
  $("previewWrap").addEventListener("dblclick", function (event) {
    if (sampling || event.target.closest(".handle")) return;
    var rect = this.getBoundingClientRect();
    var x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    var y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    var pixel = ctx.getImageData(clamp(Math.floor(x * canvas.width), 0, canvas.width - 1), clamp(Math.floor(y * canvas.height), 0, canvas.height - 1), 1, 1).data;
    if (pixel[3] < 20) { setStatus("Double-click inside the colored shape.", true); return; }
    colors.push({x:x,y:y,color:rgbToHex([pixel[0],pixel[1],pixel[2]])});
    selected = {kind:"color",index:colors.length - 1};
    updateSelected(); queuePreview(); setStatus("Color point added by double-click.");
    event.preventDefault();
  });
  $("previewWrap").addEventListener("pointermove", function (event) {
    if (!dragging) return;
    var rect = this.getBoundingClientRect();
    var point = (dragging.kind === "color" ? colors : edges)[dragging.index];
    var x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    if (dragging.handle) {
      var side = dragging.handle, opposite = side === "in" ? "out" : "in";
      var oldOpposite = point[opposite];
      var oppositeLength = Math.sqrt(oldOpposite.x * oldOpposite.x + oldOpposite.y * oldOpposite.y);
      var handleX = clamp(x, -.15, 1.15) - point.x;
      var handleY = clamp(y, -.15, 1.15) - point.y;
      point[side].x = handleX;
      point[side].y = handleY;
      if (!event.altKey) {
        var length = Math.sqrt(handleX * handleX + handleY * handleY);
        if (length > .001) {
          point[opposite].x = -handleX / length * oppositeLength;
          point[opposite].y = -handleY / length * oppositeLength;
        }
      }
    } else if (dragging.kind === "edge") {
      var safe = safetyMargin();
      var minX = $("smoothEdges").checked ? Math.min(0, point.in.x, point.out.x) : 0;
      var maxX = $("smoothEdges").checked ? Math.max(0, point.in.x, point.out.x) : 0;
      var minY = $("smoothEdges").checked ? Math.min(0, point.in.y, point.out.y) : 0;
      var maxY = $("smoothEdges").checked ? Math.max(0, point.in.y, point.out.y) : 0;
      point.x = clamp(x, safe - minX, 1 - safe - maxX);
      point.y = clamp(y, safe - minY, 1 - safe - maxY);
    } else {
      point.x = clamp(x, .03, .97);
      point.y = clamp(y, .03, .97);
    }
    if (dragging.kind === "edge") $("shape").value = "custom";
    updateSelected(); queuePreview();
  });
  window.addEventListener("pointerup", function () { dragging = null; });
  $("addColor").addEventListener("click", function () {
    var base = selected.kind === "color" ? colors[selected.index] : {x:.5,y:.5,color:"#ff758d"};
    colors.push({x:clamp(base.x + .08,.08,.92),y:clamp(base.y + .08,.08,.92),color:base.color});
    selected = {kind:"color",index:colors.length - 1};
    updateSelected(); queuePreview(); setStatus("Color point added. Drag it into place.");
  });
  $("addEdge").addEventListener("click", function () {
    var i = selected.kind === "edge" ? selected.index : 0;
    var first = edges[i], next = edges[(i + 1) % edges.length];
    var newPoint;
    if ($("smoothEdges").checked) {
      function midpoint(a, b) { return {x:(a.x + b.x) / 2,y:(a.y + b.y) / 2}; }
      var a = {x:first.x,y:first.y}, b = {x:first.x + first.out.x,y:first.y + first.out.y};
      var c = {x:next.x + next.in.x,y:next.y + next.in.y}, d = {x:next.x,y:next.y};
      var ab = midpoint(a,b), bc = midpoint(b,c), cd = midpoint(c,d);
      var abbc = midpoint(ab,bc), bccd = midpoint(bc,cd), center = midpoint(abbc,bccd);
      first.out = {x:ab.x - a.x,y:ab.y - a.y};
      next.in = {x:cd.x - d.x,y:cd.y - d.y};
      newPoint = {x:center.x,y:center.y,in:{x:abbc.x - center.x,y:abbc.y - center.y},out:{x:bccd.x - center.x,y:bccd.y - center.y}};
    } else {
      var midX = (first.x + next.x) / 2, midY = (first.y + next.y) / 2;
      newPoint = {x:midX,y:midY,in:{x:(first.x - next.x) / 6,y:(first.y - next.y) / 6},out:{x:(next.x - first.x) / 6,y:(next.y - first.y) / 6}};
    }
    edges.splice(i + 1, 0, newPoint);
    selected = {kind:"edge",index:i + 1};
    $("shape").value = "custom";
    updateSelected(); queuePreview(); setStatus("Shape point added. Drag it into place.");
  });
  $("deletePoint").addEventListener("click", deleteSelected);
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    var tag = event.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    event.preventDefault(); deleteSelected();
  });
  $("samplePreview").addEventListener("click", function () {
    sampling = !sampling;
    this.classList.toggle("active", sampling);
    $("previewWrap").classList.toggle("sampling", sampling);
    setStatus(sampling ? "Click a color inside the preview." : "Color sampling canceled.");
  });
  $("samplePhotoshop").addEventListener("click", function () {
    evalHost("gradientMeshForegroundColor()", function (result) {
      if (!result || result.indexOf("OK:") !== 0) { setStatus((result || "Photoshop did not respond.").replace(/^ERROR:/,""), true); return; }
      var color = result.slice(3);
      if (!validHex(color)) { setStatus("Photoshop returned an invalid color.", true); return; }
      setColor(color); setStatus("Selected point now uses Photoshop's foreground color.");
    });
  });
  $("randomize").addEventListener("click", function () {
    paletteIndex = (paletteIndex + 1) % palettes.length;
    var layout = makeColors(Number($("grid").value), palettes[paletteIndex]);
    colors.forEach(function (point, index) {
      point.color = layout[index % layout.length].color;
      point.x = clamp(point.x + (Math.random() - .5) * .12,.04,.96);
      point.y = clamp(point.y + (Math.random() - .5) * .12,.04,.96);
    });
    updateSelected(); queuePreview();
  });
  $("useDocument").addEventListener("click", function () {
    evalHost("gradientMeshDocumentInfo()", function (result) {
      if (!result || result.indexOf("OK:") !== 0) { setStatus((result || "Photoshop did not respond.").replace(/^ERROR:/,""), true); return; }
      var size = result.slice(3).split("|");
      $("outputWidth").value = size[0]; $("outputHeight").value = size[1];
      setStatus("Using active document dimensions.");
    });
  });
  $("addLayer").addEventListener("click", function () {
    if (!window.__adobe_cep__) { setStatus("Open this panel in Photoshop to add a layer.", true); return; }
    buildPng(function (dataUrl) {
      var filePath;
      try {
        var fs = require("fs"), os = require("os"), path = require("path");
        filePath = path.join(os.tmpdir(), "gradient-mesh-" + Date.now() + ".png");
        fs.writeFileSync(filePath, Buffer.from(dataUrl.split(",")[1], "base64"));
      } catch (error) { setStatus("Could not write temporary PNG: " + error.message, true); return; }
      var fit = $("fitLayer").checked ? "true" : "false";
      evalHost("gradientMeshPlace(" + JSON.stringify(filePath.replace(/\\/g,"/")) + "," + fit + ")", function (result) {
        try { require("fs").unlinkSync(filePath); } catch (ignore) {}
        setStatus((result || "Photoshop did not respond.").replace(/^(OK:|ERROR:)/,""), !result || result.indexOf("OK:") !== 0);
      });
    });
  });
  $("download").addEventListener("click", function () {
    buildPng(function (dataUrl) {
      var link = document.createElement("a");
      link.href = dataUrl; link.download = "gradient-mesh.png";
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setStatus("PNG downloaded.");
    });
  });
  colors = makeColors(3, palettes[0]);
  edges = makeShape("rectangle");
  var initialBounds = shapeBounds(edges);
  fitShapeInsideFeather();
  remapColors(initialBounds, shapeBounds(edges));
  updateSelected(); queuePreview();
}());
