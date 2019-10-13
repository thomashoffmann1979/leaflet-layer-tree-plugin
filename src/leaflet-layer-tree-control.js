L.Control.LayerTreeControl = L.Control.extend({
	options: {
		position: "topright",
		expand: false,
		className: "leaflet-layer-tree-control",
		layerTree: {},
		openByDefault: false,
		layerBuilders: {},
		featureBuilders: {
			WFS: {}
		}
	},
	initialize: function (options) {
		L.Util.setOptions(this, options);
		if (options.layerTree == undefined) {
			throw Error("Layer tree required to display");
		}
		this._layers = new Array();
		this._layersById = {};
		this._reloadHandlers = {};
		this._minWidth = undefined;
	},
	onAdd: function (map) {
		this._map = map;
		var className = this.options.className;
		var container = this._container = L.DomUtil.create('div', className + " leaflet-control");
		L.DomEvent.disableClickPropagation(container);
		L.DomEvent.on(container, "wheel", L.DomEvent.stopPropagation);
		container.setAttribute("aria-haspopup", true);

		// Iconify
		var layersContainer = this._layersContainer = L.DomUtil.create('div', className + '-layers-open leaflet-control-layers', container);
		var iconifyToggleControl = L.DomUtil.create("div", className + "-toggle-open leaflet-control-layers", container);
		var icon = L.DomUtil.create("div", className + "-toggle-link", iconifyToggleControl);

		var me = this;

		var layerManager = new LeafletLayerTreeLayerManager(className, iconifyToggleControl, layersContainer, me);

		// Order
		var orderContainer = L.DomUtil.create('div', className + '-order-closed leaflet-control-layers', container);
		var orderToggleControl = L.DomUtil.create("div", className + "-order-toggle-closed leaflet-control-layers", container);
		var order = L.DomUtil.create("div", className + "-order-toggle-link", orderToggleControl);

		var orderManager = this._orderManager = new LeafletLayerTreeOrderManager(className, orderContainer, orderToggleControl, layersContainer, me, layerManager);

		function toggleIconify() {
			if (layerManager.isLayersContainerOpen() || orderManager.isOrderContainerOpen()) {
				layerManager.closeLayersContainer();
				orderManager.closeOrderContainer();
				layerManager.iconifyLayersContainerToggleButton();
				orderManager.hideOrderToggleControl();
			} else {
				layerManager.openLayersContainer();
				orderManager.closeOrderContainer();
				layerManager.restoreLayersContainerToggleButton();
				orderManager.closeOrderToggleControl();
			}
		}

		L.DomEvent.on(icon, "click", function (event) {
			toggleIconify();
		}, this);

		if (!this.options.openByDefault) {
			toggleIconify();
		}

		L.DomEvent.on(order, "click", function (event) {
			orderManager.fillOrders();
			orderManager.toggleOrder();
		});

		var childrenVisibilityToggler = new LeafletLayerTreeLayerChildrenVisibilityToggler(className, layerManager);
		var leafTraverser = this._leafTraverser = new LeafletLayerTreeLeafTraverser(me, className, childrenVisibilityToggler, orderManager);


		var layerTree = me.options.layerTree;
		if (Object.prototype.toString.call(layerTree) === '[object Array]') {
			for (var i in layerTree) {
				var layerSubTree = layerTree[i];
				leafTraverser.addLeaf(layerSubTree, layersContainer, layerSubTree, "", 0);
			}
		} else {
			leafTraverser.addLeaf(layerTree, layersContainer, layerTree, "", 0);
		}

		orderManager.fillOrders();
		return container;
	},
	onRemove: function (map) {

	},
	copyParams: function (layerSettings, exceptions) {
		var params = {};
		for (var paramKey in layerSettings.params) {
			if (!exceptions || !exceptions.test(paramKey)) {
				params[paramKey] = layerSettings.params[paramKey];
			}
		}
		return params;
	},
	addLayer: function (layerSettings, layerId) {
console.log("addLayer()");
console.log(" - " + layerSettings.name + " (" + layerSettings.code + ", " + layerId + ")")
		if (!this._layersById.hasOwnProperty(layerId)) {
			this._layersById[layerId] = true;
			var map = this._map;
			var me = this;
			switch (layerSettings.serviceType) {
				case "OSM":
					var layer = L.tileLayer(layerSettings.params.url, {});
					this._addLayer(layer, layerId, layerSettings);
					break;
				case "TILE":
					var layer = L.tileLayer(layerSettings.params.url, {});
					this._addLayer(layer, layerId, layerSettings);
					break;
				case "WMS": {
					var params = this.copyParams(layerSettings, /\burl\b/gi);
					var layer = L.tileLayer.wms(layerSettings.params.url, params).addTo(map);
					this._addLayer(layer, layerId, layerSettings);
				}
					break;
				case "WFS": {
					var layers = new L.GeoJSON().addTo(map);
					var params = this.copyParams(layerSettings, /\b(url|style)\b/gi);

					this._addLayer(layers, layerId, layerSettings);
					var wfsHandler = function () {
						var bbox = map.getBounds().toBBoxString();
						if (layerSettings.coordinateSystem) {
							bbox += "," + layerSettings.coordinateSystem;
						}
						var customParams = {
							bbox: bbox,
						};
						var params2 = L.Util.extend(params, customParams);
						var wfsUrl = layerSettings.params.url + L.Util.getParamString(params2);
						$.ajax({
							url: wfsUrl,
							dataType: 'json',
							success: function (data) {
								layers.clearLayers();
								layers.addData(data);
								var style = layerSettings.params.style;
								if (style) {
									var styleObj = JSON.parse(style);
									layers.eachLayer(function (layer) {
										layer.setStyle(styleObj);
									});
								}
								var icon = layerSettings.params.icon;
								if (icon) {
									layers.eachLayer(function (layer) {
										layer.setIcon(icon);
									});
								}
								var onPopup = layerSettings.onPopup;
								var getType = {};
								if (onPopup && getType.toString.call(onPopup) === '[object Function]') {
									layers.eachLayer(function (layer) {
										var func = layerSettings.onPopup(layer);
										if (func) {
											layer.bindPopup(func);
										}
									});
								}
							},
							error: function () {
								console.error(arguments);
							}
						});
					}
					wfsHandler();
					this._reloadHandlers[layerId + "__moveend"] = wfsHandler;
					map.on("moveend", wfsHandler);
				}
					break;
				default:
					if (this.options.layerBuilders != undefined && this.options.layerBuilders != null && this.options.layerBuilders.hasOwnProperty(layerSettings.serviceType)) {
						var layer = this.options.layerBuilders[layerSettings.serviceType](layerSettings);
						this._addLayer(layer, layerId, layerSettings);
					}
					break;
			}
		} else {
			console.log("Layer " + layerId + " already added. Skipping.");
		}
	},
	_addLayer: function (layer, layerId, layerSettings) {
		if (layer) {
			this._layers.push({id: layerId, layer: layer, name: layerSettings.name});
			this._map.addLayer(layer);
		}
	},
	removeLayers: function (layer, parentId) {
console.log("removeLayers()#1");
console.log(" - " + JSON.stringify(layer));
//		this.removeLayer(layer);
		if (layer.childLayers && layer.childLayers.length > 0) {
			for (var i in layer.childLayers) {
				var child = layer.childLayers[i];
console.log("removeLayers()#2");
//				this.removeLayer(parentId + "_" + child.code + "_" + i);
				this.removeLayer(parentId + "_" + child.code + "_0");
			}
		}
	},
	_getLayerIndex: function (layerId) {
		for (var i in this._layers) {
			var layerContainer = this._layers[i];
			if (layerContainer.id == layerId) {
				return 1 * i;
			}
		}
		return undefined;
	},
	removeLayer: function (layerId) {
console.log("removeLayer()");
console.log(" - " + JSON.stringify(layerId));
		if (this._layersById.hasOwnProperty(layerId)) {
			var map = this._map;
			var layerIndex = this._getLayerIndex(layerId);
			if (layerIndex != undefined) {
				var layerContainer = this._layers[layerIndex];
				var layer = layerContainer.layer;
				map.removeLayer(layerContainer.layer);
				delete layerContainer.layer;
				delete layer;
				delete layerContainer;
				this._layers.splice(layerIndex, 1);
			}
			if (this._reloadHandlers.hasOwnProperty(layerId + "__moveend")) {
				map.off("moveend", this._reloadHandlers[layerId + "__moveend"]);
				delete this._reloadHandlers[layerId + "__moveend"];
			}
			delete this._layersById[layerId];
		}
	},
	_findLayerSettings: function (layerCode, arr) {
		var layerTree = arr ? arr : this.options.layerTree;
		if (Object.prototype.toString.call(layerTree) === '[object Array]') {
			for (var i in layerTree) {
				var layerSubTree = layerTree[i];
				if (layerSubTree.code == layerCode) {
					return layerSubTree;
				}
				if (layerSubTree.childLayers && layerSubTree.childLayers.length > 0) {
					var result = this._findLayerSettings(layerCode, layerSubTree.childLayers);
					if (result) {
						return result;
					}
				}
			}
		} else {
			if (layerSubTree.code == layerCode) {
				return layerSubTree;
			}
			if (layerSubTree.childLayers && layerSubTree.childLayers.length > 0) {
				var result = this._findLayerSettings(layerCode, layerSubTree.childLayers);
				if (result) {
					return result;
				}
			}
		}
	},
	addLayer2: function (layerSettings, parentLayerCode) {
		// find parent layer,
		var parentSettings = this._findLayerSettings(parentLayerCode);
		if (!parentSettings) {
			throw new Error("Parent layer " + parentLayerCode + " cannot be found!");
		}
		parentSettings.childLayers.push(layerSettings);

		// find last layer by code
		var parentContainerHolder = this._leafTraverser.getLastContainerByCode(parentLayerCode);
console.log("addLayer2()");
console.log(" - " + layerSettings.name + ", " + parentLayerCode + "." + layerSettings.code);

		var parentLeafId = parentContainerHolder.id;
		var leafOrder = 0;
		var content = parentContainerHolder.container.getElementsByClassName(this.options.className + "-leaf-content");
		if (content.length > 0) {
			content = content[0];
		}

		// add layer to parent
		this._leafTraverser.addLeaf(parentSettings, content, layerSettings, parentLeafId, leafOrder);
	},
	removeLayer2: function (layerCode, parentLayerCode) {
		var layerTree = this._findLayerSettings(layerCode, parentLayerCode);
		this._leafTraverser.removeLeaf(layerCode);
	}
});

function LeafletLayerTreeCheckboxWrapper(className) {
	var INCLUDE_NONE = "none";
	var INCLUDE_SELF = "self";
	var INCLUDE_CHILDREN = "including-children";
	this.className = className;
	var childrenCheckboxes = {};
	var layers = {};
	var layerSettings = {};

	return {
		prepare: function prepare(layerId, parentId,
								  parentLeaf, leafTitle, leaf,
								  me, orderManager) {

			function resetIncludeChildrenForParent(elementId) {
				var elem = document.getElementById(elementId);
				if (elem && layers.hasOwnProperty(elementId)) {
					var parentId = layers[elementId].parentId;
					var parent = document.getElementById(parentId);
					if (parent) {
						var parentState = readCheckboxState0(parent);
						if (parentState == INCLUDE_CHILDREN) {
							updateCheckboxState0(parent, INCLUDE_SELF);
							resetIncludeChildrenForParent(parentId);
						}
					}
				}
			}

			function readCheckboxState0(element) {
				return element.value;
			}

			function updateCheckboxState0(checkbox, state) {
				checkbox.value = state;
				checkbox.className = className + ".leaflet-layer-tree-control-select-layers "
					+ className + "-select-layers-" + state;
			}

			function updateCheckboxState(elementId, state) {
				var elem = document.getElementById(elementId);
				if (elem) {
					var nextState = calcAvailableState0(elementId, state);
					updateCheckboxState0(elem, nextState);
				}
			}

			function toggleLayerMULTIPLE(elementId, state) {
				if (elementId) {
					// add or remove currently selected layer
					if (state == INCLUDE_CHILDREN) {
						var childIds = childrenCheckboxes[elementId];
						for (var i in childIds) {
							var childId = childIds[i];
							toggleLayerMULTIPLE(childId, state);
							updateCheckboxState(childId, state);
						}
						me.addLayer(layerSettings[elementId], elementId);
					} else if (state == INCLUDE_SELF) {
						me.addLayer(leaf, elementId);
						// updateCheckboxState(elementId, INCLUDE_SELF);
					} else {
						var childIds = childrenCheckboxes[elementId];
						for (var i in childIds) {
							var childId = childIds[i];
							toggleLayerMULTIPLE(childId, state);
							updateCheckboxState(childId, state);
						}
						me.removeLayer(elementId);
					}
					orderManager.fillOrders();
				}
			}

			var parentLeafCode = parentLeaf.code;

			var checkbox = L.DomUtil.create("div", "", leafTitle);
			checkbox.name = parentLeafCode;
			checkbox.id = layerId;
			checkbox.parentId = parentId;
			checkbox.className = className + ".leaflet-layer-tree-control-select-layers "
				+ className + "-select-layers-" + INCLUDE_NONE;
			checkbox.value = INCLUDE_NONE;

			var label = L.DomUtil.create("label", "", leafTitle);
			var labelText = L.DomUtil.create("span", "", label);
			labelText.innerHTML = leaf.name;

			function calcAvailableState0(layerId, state) {
				var childrenCheckboxesList = childrenCheckboxes[layerId];
				if (state == INCLUDE_CHILDREN && (childrenCheckboxesList == undefined || childrenCheckboxesList.length == 0)) {
					return INCLUDE_SELF;
				}
				return state;
			}

			function advanceState0(layerId, currentState) {
				var childrenCheckboxesList = childrenCheckboxes[layerId];
				var nextState = INCLUDE_NONE;
				if (currentState == INCLUDE_NONE) {
					nextState = INCLUDE_SELF;
				} else if (childrenCheckboxesList != undefined && childrenCheckboxesList.length > 0 &&
					currentState == INCLUDE_SELF) {
					nextState = INCLUDE_CHILDREN;
				}
				return nextState;
			}

			function advanceState(event) {
				var elem = event.srcElement != undefined ? event.srcElement : this;
				var checkbox = elem.parentElement.parentElement.getElementsByTagName("div")[0];
				var elementId = checkbox.id;
				var currentState = checkbox.value;
				var nextState = advanceState0(elementId, currentState);
				updateCheckboxState0(checkbox, nextState);
				resetIncludeChildrenForParent(elementId);
				toggleLayerMULTIPLE(elementId, nextState, leafTitle);
			}

			L.DomEvent.on(checkbox, "click", function (event) {
				advanceState.call(this, event);
			});
			L.DomEvent.on(label, "click", function (event) {
				advanceState.call(this, event);
			});
			if (leaf.selectedByDefault) {
				updateCheckboxState0(checkbox, INCLUDE_SELF);
				toggleLayerMULTIPLE(layerId, checkbox.value, leafTitle);
			}

			return parentLeafCode;
		},
		clearChildCheckboxCounter: function () {
			childrenCheckboxes = {};
			layerSettings = {};
			layers = {};
		},
		incrementChildrenCheckbox: function (parentId, childId, leaf) {
			if (!childrenCheckboxes.hasOwnProperty(parentId)) {
				childrenCheckboxes[parentId] = new Array();
			}
			childrenCheckboxes[parentId].push(childId);
			layerSettings[childId] = leaf;
			layers[childId] = {
				parentId: parentId
			};
		}
	}
}

function LeafletLayerTreeLeafTraverser(thePluginArg, className, childrenVisibilityToggler, orderManagerArg) {
	this.className = className;
	var checkboxWrapper = LeafletLayerTreeCheckboxWrapper(className);
	var orderManager = orderManagerArg;
	var thePlugin = thePluginArg;
	var containersByCode = new Object()
	return {
		buildLeafId: function (parentId, leafSettings, order) {
			return parentId + "_" + leafSettings.code + "_" + order;
		},
		getLastContainerByCode: function (code) {
			var containers = containersByCode[code];
			if (!containers) {
				return
			}
			return containers[containers.length - 1];
		},
		addLeaf: function (parentLeafSettings, parentContainer, leafSettings, parentLeafId, leafOrder) {
			var leafContainer = L.DomUtil.create("div", className + "-leaf", parentContainer);
			var leafHeader = L.DomUtil.create("div", className + "-leaf-header", leafContainer);
			var leafTitle = L.DomUtil.create("span", className + "-leaf-title", leafHeader);
			{
				var leafSwitcherRow = L.DomUtil.create("span", className + "-leaf-switcher-row", leafHeader);
				var leafSwitcher = L.DomUtil.create("span", className + "-leaf-switcher", leafSwitcherRow);
				L.DomEvent.on(leafSwitcher, "click", function (event) {
					var elem = event.srcElement != undefined ? event.srcElement : this;
					childrenVisibilityToggler.toggleChildrenVisibility(elem.parentElement.parentElement.parentElement);
				});
			}
			var leafId = this.buildLeafId(parentLeafId, leafSettings, leafOrder);

			var leafCode = leafSettings.code;
			if (!containersByCode[leafCode]) {
				containersByCode[leafCode] = new Array();
			}
			containersByCode[leafCode].push({"id": leafId, "container": leafContainer, "order": leafOrder});

			function toggleLayerSINGLE(parentElementId, sourceElementId, leafTitle) {
console.log("toggleLayerSINGLE()");
				thePlugin.removeLayers(parentLeafSettings, parentElementId);
				thePlugin.removeLayer(sourceElementId);
				thePlugin.addLayer(leafSettings, sourceElementId);
				orderManager.fillOrders();
			}
console.log("addLeaf()");
console.log(" - " + leafSettings.name + "  (" + parentLeafId + "." + leafSettings.code + ")");

			if (leafSettings.active) {
				switch (parentLeafSettings.selectType) {
					case "NONE":	//
						leafTitle.innerHTML = "<label>" + leafSettings.name + "</label>"
						break;
					case "SINGLE":	// radio-group
					{
						var checkbox = L.DomUtil.create("input", "", leafTitle);
						checkbox.name = parentLeafSettings.code;
						checkbox.id = leafId;
						checkbox.parentId = parentLeafId;
						checkbox.type = "radio";
						var label = L.DomUtil.create("label", "", leafTitle);
						var labelText = L.DomUtil.create("span", "", label);
						labelText.innerHTML = leafSettings.name;
						L.DomEvent.on(checkbox, "change", function (event) {
							var elem = event.srcElement != undefined ? event.srcElement : this;
							var sourceElementId = elem.id;
							if (sourceElementId) {
								var parentElementId = elem.parentId;
								var checked = elem.checked;
								if (checked) {
									toggleLayerSINGLE(parentElementId, sourceElementId);
								}
							}
						});
						L.DomEvent.on(label, "click", function (event) {
							var elem = event.srcElement != undefined ? event.srcElement : this;
							var checkbox = elem.parentElement.parentElement.getElementsByTagName("input")[0];
							checkbox.checked = true;
							var parentElementId = checkbox.parentId;
							var sourceElementId = checkbox.id;
							toggleLayerSINGLE(parentElementId, sourceElementId);
						});
						if (leafSettings.selectedByDefault) {
							checkbox.checked = true;
							toggleLayerSINGLE(parentLeafId, leafId);
						}
					}
						break;
					case "MULTIPLE":
					default:	// checkboxes
					{
						checkboxWrapper.prepare(leafId, parentLeafId,
							parentLeafSettings, leafTitle, leafSettings,
							thePlugin, orderManager
						);
						checkboxWrapper.incrementChildrenCheckbox(parentLeafId, leafId, leafSettings);
					}
						break;
				}
				if (thePlugin.options.featureBuilders.hasOwnProperty(leafSettings.serviceType)) {
					var featureBuilders = thePlugin.options.featureBuilders[leafSettings.serviceType];
					for (var i in featureBuilders) {
						var featureBuilder = featureBuilders[i];
						featureBuilder(leafTitle, leafSettings, thePlugin.options, thePlugin._map);
					}
				}
				var leafContent = L.DomUtil.create("div", className + "-leaf-content", leafContainer);
				if (leafSettings.childLayers && leafSettings.childLayers.length > 0) {
					for (var i in leafSettings.childLayers) {
						var childLeafSettings = leafSettings.childLayers[i];
						if (childLeafSettings) {
							this.addLeaf(leafSettings, leafContent, childLeafSettings, leafId, i);
						}
					}
				}

				childrenVisibilityToggler.toggleChildrenVisibility(leafContainer.parentNode.parentNode, parentLeafSettings.openByDefault);
			}
		},
		removeLeaf: function (leafId) {
			if (!containersByCode[leafId]) {
				return;
			}
			if (containersByCode[leafId].length > 0) {
				containersByCode[leafId].pop();
			}
		}
	}
}

function LeafletLayerTreeLayerChildrenVisibilityToggler(className, layerManager) {
	this.className = className;

	// Layers
	return {
		checkIfParentIsHeader: function (elem) {
			return (elem.childNodes.length >= 2)
				&& (elem.childNodes[0].className == className + "-leaf-header")
				&& (elem.childNodes[1].className == className + "-leaf-content");
		},

		toggleChildrenVisibility: function (elem, open) {
			if (this.checkIfParentIsHeader(elem)) {
				var header = elem.childNodes[0];
				var content = elem.childNodes[1];
				var switcherRow = header.getElementsByClassName(className + "-leaf-switcher-row");
				if (switcherRow.length == 1) {
					var toggleButtons = switcherRow[0].getElementsByClassName(className + "-leaf-switcher");
					if (toggleButtons.length == 1) {
						var toggleButton = toggleButtons[0];
						if (open === undefined) {
							open = content.style.display == "none";
						}
						if (open) {
							content.style.display = "";
							toggleButton.className = className + "-leaf-switcher " + className + "-leaf-switcher-closed";
						} else {
							layerManager.updateLayerContainerMinWidth();
							content.style.display = "none";
							toggleButton.className = className + "-leaf-switcher " + className + "-leaf-switcher-open";
						}
					}
				}
			}
		}
	}
}

function LeafletLayerTreeOrderManager(className, orderContainer, orderToggleControl, layersContainer, me, layerManager) {
	var me1 = this;
	this.toggleOrder = function () {
		if (this.isOrderContainerOpen()) {
			this.closeOrderToggleControl();
			this.closeOrderContainer();
			layerManager.openLayersContainer();
		} else {
			this.openOrderToggleControl();
			this.openOrderContainer();
			layerManager.closeLayersContainer();
		}
	};
	this.reorder = function (top, bottom) {
		if (top > bottom) {
			var layers = me._layers;
			var s = layers[top];
			for (var i = top; i > bottom; i--) {
				layers[i] = layers[i - 1];
			}
			layers[bottom] = s;
		} else if (top < bottom) {
			var layers = me._layers;
			var s = layers[top];
			for (var i = top; i < bottom; i++) {
				layers[i] = layers[i + 1];
			}
			layers[bottom] = s;
		}
	};
	this.fillOrders = function () {
		orderContainer.innerHTML = "";
		var layers = me._layers;
console.log("fillOrders()");
		for (var i = layers.length - 1; i > -1; i--) {
			var layerContainer = layers[i];
			if (layerContainer.layer.setZIndex != undefined) {
				layerContainer.layer.setZIndex(i);
			}
			var row = L.DomUtil.create("div", className + "-order-row", orderContainer);
			var rowContent = L.DomUtil.create("div", className + "-order-row-content", row);
			var label = L.DomUtil.create("label", "", rowContent);
			label.innerHTML = layerContainer.name;
var positionLog = " (" + layerContainer.id + ", " + i + "/" + (layers.length - 1) + ")";
console.log(" - " + layerContainer.name + positionLog);
			if (i > 0) {
				var down = L.DomUtil.create("span", className + "-order-down", rowContent);
				L.DomEvent.on(down, "click", function (event) {
					var elem = event.currentTarget ? event.currentTarget : me;
					var layerId = elem.parentElement.layerId;
					var index = me._getLayerIndex(layerId);
					me1.reorder(index - 1, index);
					me1.fillOrders();
				});
			}
			if (i < layers.length - 1) {
				var up = L.DomUtil.create("span", className + "-order-up", rowContent);
				L.DomEvent.on(up, "click", function (event) {
					var elem = event.currentTarget ? event.currentTarget : me;
					var layerId = elem.parentElement.layerId;
					var index = me._getLayerIndex(layerId);
					me1.reorder(index + 1, index);
					me1.fillOrders();
				});
			}

			rowContent.layerId = layerContainer.id;
			rowContent.draggable = true;
			rowContent.droppable = true;
			rowContent.ondragstart = function (event) {
				var elem = event.currentTarget != undefined ? event.currentTarget : me;
				var sourceId = elem.layerId;
				event.dataTransfer.setData("text/plain", sourceId);
			};
			rowContent.ondragover = function (event) {
				var elem = event.currentTarget != undefined ? event.currentTarget : me;
				var sourceId = elem.layerId;
				var targetId = event.dataTransfer.getData("text/plain");
				var sourceIndex = me._getLayerIndex(sourceId);
				if (sourceIndex != undefined/* && targetIndex != undefined && sourceIndex != targetIndex*/) {
					event.preventDefault();
				}
			};
			rowContent.ondrop = function (event) {
				event.preventDefault();
				var elem = event.currentTarget != undefined ? event.currentTarget : me;
				var sourceId = elem.layerId;
				var targetId = event.dataTransfer.getData("text/plain");
				var sourceIndex = me._getLayerIndex(sourceId);
				var targetIndex = me._getLayerIndex(targetId);
				if (sourceIndex != undefined && targetIndex != undefined && sourceIndex != targetIndex) {
					me1.reorder(targetIndex, sourceIndex);
					me1.fillOrders();
				}
			}
		}
	};
	return {
		orderContainer: orderContainer,
		orderToggleControl: orderToggleControl,
		layersContainer: layersContainer,
		layers: me._layers,
		toggleOrder: this.toggleOrder,
		reorder: this.reorder,
		fillOrders: this.fillOrders,
		isOrderContainerOpen: function () {
			return orderContainer.classList.contains(className + "-order-open");
		},
		closeOrderContainer: function () {
			orderContainer.className = className + '-order-closed leaflet-control-layers';
		},
		openOrderContainer: function () {
			layerManager.updateLayerContainerMinWidth();
			orderContainer.style.minWidth = layersContainer.style.minWidth;
			orderContainer.className = className + '-order-open leaflet-control-layers';
		},
		openOrderToggleControl: function () {
			orderToggleControl.className = className + "-order-toggle-open leaflet-control-layers";
		},
		closeOrderToggleControl: function () {
			orderToggleControl.className = className + "-order-toggle-closed leaflet-control-layers";
		},
		hideOrderToggleControl: function () {
			orderToggleControl.className = className + "-order-toggle-hidden leaflet-control-layers";
		}
	}

}

function LeafletLayerTreeLayerManager(className, iconifyToggleControl, layersContainer, me) {
	return {
		iconifyLayersContainerToggleButton: function () {
			iconifyToggleControl.className = className + "-toggle-closed leaflet-control-layers"
		},
		restoreLayersContainerToggleButton: function () {
			iconifyToggleControl.className = className + "-toggle-open leaflet-control-layers"
		},
		isLayersContainerOpen: function () {
			return layersContainer.classList.contains(className + "-layers-open");
		},
		openLayersContainer: function () {
			layersContainer.className = className + '-layers-open leaflet-control-layers';
		},
		closeLayersContainer: function () {
			layersContainer.className = className + '-layers-closed leaflet-control-layers';
		},
		updateLayerContainerMinWidth: function () {
			if (me._minWidth == undefined) {
				me._minWidth = layersContainer.offsetWidth;
			} else {
				if (me._minWidth < layersContainer.offsetWidth) {
					me._minWidth = layersContainer.offsetWidth;
				}
			}
			layersContainer.style.minWidth = me._minWidth + "px";
		}
	}
}
