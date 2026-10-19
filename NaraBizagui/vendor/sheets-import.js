(() => {
  // node_modules/min-dash/dist/index.js
  var nativeToString = Object.prototype.toString;
  var nativeHasOwnProperty = Object.prototype.hasOwnProperty;
  function isUndefined(obj) {
    return obj === void 0;
  }
  function isNil(obj) {
    return obj == null;
  }
  function isArray(obj) {
    return nativeToString.call(obj) === "[object Array]";
  }
  function isObject(obj) {
    return nativeToString.call(obj) === "[object Object]";
  }
  function isNumber(obj) {
    return nativeToString.call(obj) === "[object Number]";
  }
  function isFunction(obj) {
    const tag = nativeToString.call(obj);
    return tag === "[object Function]" || tag === "[object AsyncFunction]" || tag === "[object GeneratorFunction]" || tag === "[object AsyncGeneratorFunction]" || tag === "[object Proxy]";
  }
  function isString(obj) {
    return nativeToString.call(obj) === "[object String]";
  }
  function has(target, key) {
    return !isNil(target) && nativeHasOwnProperty.call(target, key);
  }
  function find(collection, matcher) {
    const matchFn = toMatcher(matcher);
    let match;
    forEach(collection, function(val, key) {
      if (matchFn(val, key)) {
        match = val;
        return false;
      }
    });
    return match;
  }
  function filter(collection, matcher) {
    const matchFn = toMatcher(matcher);
    let result = [];
    forEach(collection, function(val, key) {
      if (matchFn(val, key)) {
        result.push(val);
      }
    });
    return result;
  }
  function forEach(collection, iterator) {
    let val, result;
    if (isUndefined(collection)) {
      return;
    }
    const convertKey = isArray(collection) ? toNum : identity;
    for (let key in collection) {
      if (has(collection, key)) {
        val = collection[key];
        result = iterator(val, convertKey(key));
        if (result === false) {
          return val;
        }
      }
    }
  }
  function reduce(collection, iterator, result) {
    forEach(collection, function(value, idx) {
      result = iterator(result, value, idx);
    });
    return result;
  }
  function every(collection, matcher) {
    return !!reduce(collection, function(matches, val, key) {
      return matches && matcher(val, key);
    }, true);
  }
  function some(collection, matcher) {
    return !!find(collection, matcher);
  }
  function map(collection, fn) {
    let result = [];
    forEach(collection, function(val, key) {
      result.push(fn(val, key));
    });
    return result;
  }
  function toMatcher(matcher) {
    return isFunction(matcher) ? matcher : (e2) => {
      return e2 === matcher;
    };
  }
  function identity(arg) {
    return arg;
  }
  function toNum(arg) {
    return Number(arg);
  }
  function assign(target, ...others) {
    return Object.assign(target, ...others);
  }

  // node_modules/bpmn-js/lib/import/Util.js
  function elementToString(e2) {
    if (!e2) {
      return "<null>";
    }
    return "<" + e2.$type + (e2.id ? ' id="' + e2.id : "") + '" />';
  }

  // node_modules/bpmn-js/lib/util/CompatibilityUtil.js
  var DI_ERROR_MESSAGE = "Tried to access di from the businessObject. The di is available through the diagram element only. For more information, see https://github.com/bpmn-io/bpmn-js/issues/1472";
  function ensureCompatDiRef(businessObject) {
    if (!has(businessObject, "di")) {
      Object.defineProperty(businessObject, "di", {
        enumerable: false,
        get: function() {
          throw new Error(DI_ERROR_MESSAGE);
        }
      });
    }
  }

  // node_modules/bpmn-js/lib/import/BpmnTreeWalker.js
  function is(element, type) {
    return element.$instanceOf(type);
  }
  function findDisplayCandidate(definitions) {
    return find(definitions.rootElements, function(e2) {
      return is(e2, "bpmn:Process") || is(e2, "bpmn:Collaboration");
    });
  }
  function BpmnTreeWalker(handler) {
    var handledElements = {};
    var deferred = [];
    var diMap = {};
    function contextual(fn, ctx) {
      return function(e2) {
        fn(e2, ctx);
      };
    }
    function handled(element) {
      handledElements[element.id] = element;
    }
    function isHandled(element) {
      return handledElements[element.id];
    }
    function visit(element, ctx) {
      var gfx = element.gfx;
      if (gfx) {
        throw new Error(
          `already rendered ${elementToString(element)}`
        );
      }
      return handler.element(element, diMap[element.id], ctx);
    }
    function visitRoot(element, diagram) {
      return handler.root(element, diMap[element.id], diagram);
    }
    function visitIfDi(element, ctx) {
      try {
        var gfx = diMap[element.id] && visit(element, ctx);
        handled(element);
        return gfx;
      } catch (error) {
        logError(error.message, { element, error });
        console.error(`failed to import ${elementToString(element)}`, error);
      }
    }
    function logError(message, context) {
      handler.error(message, context);
    }
    var registerDi = this.registerDi = function registerDi2(di) {
      var bpmnElement = di.bpmnElement;
      if (bpmnElement) {
        if (diMap[bpmnElement.id]) {
          logError(
            `multiple DI elements defined for ${elementToString(bpmnElement)}`,
            { element: bpmnElement }
          );
        } else {
          diMap[bpmnElement.id] = di;
          ensureCompatDiRef(bpmnElement);
        }
      } else {
        logError(
          `no bpmnElement referenced in ${elementToString(di)}`,
          { element: di }
        );
      }
    };
    function handleDiagram(diagram) {
      handlePlane(diagram.plane);
    }
    function handlePlane(plane) {
      registerDi(plane);
      forEach(plane.planeElement, handlePlaneElement);
    }
    function handlePlaneElement(planeElement) {
      registerDi(planeElement);
    }
    this.handleDefinitions = function handleDefinitions(definitions, diagram) {
      var diagrams = definitions.diagrams;
      if (diagram && diagrams.indexOf(diagram) === -1) {
        throw new Error("diagram not part of <bpmn:Definitions />");
      }
      if (!diagram && diagrams && diagrams.length) {
        diagram = diagrams[0];
      }
      if (!diagram) {
        throw new Error("no diagram to display");
      }
      diMap = {};
      handleDiagram(diagram);
      var plane = diagram.plane;
      if (!plane) {
        throw new Error(
          `no plane for ${elementToString(diagram)}`
        );
      }
      var rootElement = plane.bpmnElement;
      if (!rootElement) {
        rootElement = findDisplayCandidate(definitions);
        if (!rootElement) {
          throw new Error("no process or collaboration to display");
        } else {
          logError(
            `correcting missing bpmnElement on ${elementToString(plane)} to ${elementToString(rootElement)}`
          );
          plane.bpmnElement = rootElement;
          registerDi(plane);
        }
      }
      var ctx = visitRoot(rootElement, plane);
      if (is(rootElement, "bpmn:Process") || is(rootElement, "bpmn:SubProcess")) {
        handleProcess(rootElement, ctx);
      } else if (is(rootElement, "bpmn:Collaboration")) {
        handleCollaboration(rootElement, ctx);
        handleUnhandledProcesses(definitions.rootElements, ctx);
      } else {
        throw new Error(
          `unsupported bpmnElement for ${elementToString(plane)}: ${elementToString(rootElement)}`
        );
      }
      handleDeferred(deferred);
    };
    var handleDeferred = this.handleDeferred = function handleDeferred2() {
      var fn;
      while (deferred.length) {
        fn = deferred.shift();
        fn();
      }
    };
    function handleProcess(process, context) {
      handleFlowElementsContainer(process, context);
      handleIoSpecification(process.ioSpecification, context);
      handleArtifacts(process.artifacts, context);
      handled(process);
    }
    function handleUnhandledProcesses(rootElements, ctx) {
      var processes = filter(rootElements, function(e2) {
        return !isHandled(e2) && is(e2, "bpmn:Process") && e2.laneSets;
      });
      processes.forEach(contextual(handleProcess, ctx));
    }
    function handleMessageFlow(messageFlow, context) {
      visitIfDi(messageFlow, context);
    }
    function handleMessageFlows(messageFlows, context) {
      forEach(messageFlows, contextual(handleMessageFlow, context));
    }
    function handleDataAssociation(association, context) {
      visitIfDi(association, context);
    }
    function handleDataInput(dataInput, context) {
      visitIfDi(dataInput, context);
    }
    function handleDataOutput(dataOutput, context) {
      visitIfDi(dataOutput, context);
    }
    function handleArtifact(artifact, context) {
      visitIfDi(artifact, context);
    }
    function handleArtifacts(artifacts, context) {
      forEach(artifacts, function(e2) {
        if (is(e2, "bpmn:Association")) {
          deferred.push(function() {
            handleArtifact(e2, context);
          });
        } else {
          handleArtifact(e2, context);
        }
      });
    }
    function handleIoSpecification(ioSpecification, context) {
      if (!ioSpecification) {
        return;
      }
      forEach(ioSpecification.dataInputs, contextual(handleDataInput, context));
      forEach(ioSpecification.dataOutputs, contextual(handleDataOutput, context));
    }
    var handleSubProcess = this.handleSubProcess = function handleSubProcess2(subProcess, context) {
      handleFlowElementsContainer(subProcess, context);
      handleArtifacts(subProcess.artifacts, context);
    };
    function handleFlowNode(flowNode, context) {
      var childCtx = visitIfDi(flowNode, context);
      if (is(flowNode, "bpmn:SubProcess")) {
        handleSubProcess(flowNode, childCtx || context);
      }
      if (is(flowNode, "bpmn:Activity")) {
        handleIoSpecification(flowNode.ioSpecification, context);
      }
      deferred.push(function() {
        forEach(flowNode.dataInputAssociations, contextual(handleDataAssociation, context));
        forEach(flowNode.dataOutputAssociations, contextual(handleDataAssociation, context));
      });
    }
    function handleSequenceFlow(sequenceFlow, context) {
      visitIfDi(sequenceFlow, context);
    }
    function handleDataElement(dataObject, context) {
      visitIfDi(dataObject, context);
    }
    function handleLane(lane, context) {
      deferred.push(function() {
        var newContext = visitIfDi(lane, context);
        if (lane.childLaneSet) {
          handleLaneSet(lane.childLaneSet, newContext || context);
        }
        wireFlowNodeRefs(lane);
      });
    }
    function handleLaneSet(laneSet, context) {
      forEach(laneSet.lanes, contextual(handleLane, context));
    }
    function handleLaneSets(laneSets, context) {
      forEach(laneSets, contextual(handleLaneSet, context));
    }
    function handleFlowElementsContainer(container, context) {
      handleFlowElements(container.flowElements, context);
      if (container.laneSets) {
        handleLaneSets(container.laneSets, context);
      }
    }
    function handleFlowElements(flowElements, context) {
      forEach(flowElements, function(flowElement) {
        if (is(flowElement, "bpmn:SequenceFlow")) {
          deferred.push(function() {
            handleSequenceFlow(flowElement, context);
          });
        } else if (is(flowElement, "bpmn:BoundaryEvent")) {
          deferred.unshift(function() {
            handleFlowNode(flowElement, context);
          });
        } else if (is(flowElement, "bpmn:FlowNode")) {
          handleFlowNode(flowElement, context);
        } else if (is(flowElement, "bpmn:DataObject")) {
        } else if (is(flowElement, "bpmn:DataStoreReference")) {
          handleDataElement(flowElement, context);
        } else if (is(flowElement, "bpmn:DataObjectReference")) {
          handleDataElement(flowElement, context);
        } else {
          logError(
            `unrecognized flowElement ${elementToString(flowElement)} in context ${elementToString(context && context.businessObject)}`,
            {
              element: flowElement,
              context
            }
          );
        }
      });
    }
    function handleParticipant(participant, context) {
      var newCtx = visitIfDi(participant, context);
      var process = participant.processRef;
      if (process) {
        handleProcess(process, newCtx || context);
      }
    }
    function handleCollaboration(collaboration, context) {
      forEach(collaboration.participants, contextual(handleParticipant, context));
      deferred.push(function() {
        handleMessageFlows(collaboration.messageFlows, context);
      });
      handleArtifacts(collaboration.artifacts, context);
    }
    function wireFlowNodeRefs(lane) {
      forEach(lane.flowNodeRef, function(flowNode) {
        var lanes = flowNode.get("lanes");
        if (lanes) {
          lanes.push(lane);
        }
      });
    }
  }

  // node_modules/bpmn-js/lib/util/ModelUtil.js
  function is2(element, type) {
    var bo = getBusinessObject(element);
    return bo && typeof bo.$instanceOf === "function" && bo.$instanceOf(type);
  }
  function isAny(element, types) {
    return some(types, function(t) {
      return is2(element, t);
    });
  }
  function getBusinessObject(element) {
    return element && element.businessObject || element;
  }
  function getDi(element) {
    return element && element.di;
  }

  // node_modules/bpmn-js/lib/import/Importer.js
  function importBpmnDiagram(diagram, definitions, bpmnDiagram) {
    var importer, eventBus, canvas;
    var error, warnings = [];
    function render(definitions2, bpmnDiagram2) {
      var visitor = {
        root: function(element, di) {
          return importer.add(element, di);
        },
        element: function(element, di, parentShape) {
          return importer.add(element, di, parentShape);
        },
        error: function(message, context) {
          warnings.push({ message, context });
        }
      };
      var walker = new BpmnTreeWalker(visitor);
      bpmnDiagram2 = bpmnDiagram2 || definitions2.diagrams && definitions2.diagrams[0];
      var diagramsToImport = getDiagramsToImport(definitions2, bpmnDiagram2);
      if (!diagramsToImport) {
        throw new Error("no diagram to display");
      }
      forEach(diagramsToImport, function(diagram2) {
        walker.handleDefinitions(definitions2, diagram2);
      });
      var rootId = bpmnDiagram2.plane.bpmnElement.id;
      canvas.setRootElement(
        canvas.findRoot(rootId + "_plane") || canvas.findRoot(rootId)
      );
    }
    return new Promise(function(resolve, reject) {
      try {
        importer = diagram.get("bpmnImporter");
        eventBus = diagram.get("eventBus");
        canvas = diagram.get("canvas");
        eventBus.fire("import.render.start", { definitions });
        render(definitions, bpmnDiagram);
        eventBus.fire("import.render.complete", {
          error,
          warnings
        });
        return resolve({ warnings });
      } catch (e2) {
        e2.warnings = warnings;
        return reject(e2);
      }
    });
  }
  function getDiagramsToImport(definitions, bpmnDiagram) {
    if (!bpmnDiagram || !bpmnDiagram.plane) {
      return;
    }
    var bpmnElement = bpmnDiagram.plane.bpmnElement, rootElement = bpmnElement;
    if (!is2(bpmnElement, "bpmn:Process") && !is2(bpmnElement, "bpmn:Collaboration")) {
      rootElement = findRootProcess(bpmnElement);
    }
    var collaboration;
    if (is2(rootElement, "bpmn:Collaboration")) {
      collaboration = rootElement;
    } else {
      collaboration = find(definitions.rootElements, function(element) {
        if (!is2(element, "bpmn:Collaboration")) {
          return;
        }
        return find(element.participants, function(participant) {
          return participant.processRef === rootElement;
        });
      });
    }
    var rootElements = [rootElement];
    if (collaboration) {
      rootElements = map(collaboration.participants, function(participant) {
        return participant.processRef;
      });
      rootElements.push(collaboration);
    }
    var allChildren = selfAndAllFlowElements(rootElements);
    var diagramsToImport = [bpmnDiagram];
    var handledElements = [bpmnElement];
    forEach(definitions.diagrams, function(diagram) {
      if (!diagram.plane) {
        return;
      }
      var businessObject = diagram.plane.bpmnElement;
      if (allChildren.indexOf(businessObject) !== -1 && handledElements.indexOf(businessObject) === -1) {
        diagramsToImport.push(diagram);
        handledElements.push(businessObject);
      }
    });
    return diagramsToImport;
  }
  function selfAndAllFlowElements(elements) {
    var result = [];
    forEach(elements, function(element) {
      if (!element) {
        return;
      }
      result.push(element);
      result = result.concat(selfAndAllFlowElements(element.flowElements));
    });
    return result;
  }
  function findRootProcess(element) {
    var parent = element;
    while (parent) {
      if (is2(parent, "bpmn:Process")) {
        return parent;
      }
      parent = parent.$parent;
    }
  }

  // node_modules/bpmn-js/lib/util/DiUtil.js
  function isHorizontal(element) {
    if (!is2(element, "bpmn:Participant") && !is2(element, "bpmn:Lane")) {
      return void 0;
    }
    var isHorizontal4 = getDi(element).isHorizontal;
    if (isHorizontal4 === void 0) {
      return true;
    }
    return isHorizontal4;
  }

  // node_modules/bpmn-js/lib/features/modeling/util/ModelingUtil.js
  function getParent(element, anyType) {
    if (isString(anyType)) {
      anyType = [anyType];
    }
    while (element = element.parent) {
      if (isAny(element, anyType)) {
        return element;
      }
    }
    return null;
  }
  function isDirectionHorizontal(element, elementRegistry) {
    var parent = getParent(element, "bpmn:Process");
    if (parent) {
      return true;
    }
    var types = ["bpmn:Participant", "bpmn:Lane"];
    parent = getParent(element, types);
    if (parent) {
      return isHorizontal(parent);
    } else if (isAny(element, types)) {
      return isHorizontal(element);
    }
    var process;
    for (process = getBusinessObject(element); process; process = process.$parent) {
      if (is2(process, "bpmn:Process")) {
        break;
      }
    }
    if (!elementRegistry) {
      return true;
    }
    var pool = elementRegistry.find(function(shape) {
      var businessObject = getBusinessObject(shape);
      return businessObject && businessObject.get("processRef") === process;
    });
    if (!pool) {
      return true;
    }
    return isHorizontal(pool);
  }

  // node_modules/bpmn-js/lib/features/grid-snapping/BpmnGridSnapping.js
  function BpmnGridSnapping(eventBus) {
    eventBus.on([
      "create.init",
      "shape.move.init"
    ], function(event) {
      var context = event.context, shape = event.shape;
      if (isAny(shape, [
        "bpmn:Participant",
        "bpmn:SubProcess",
        "bpmn:TextAnnotation"
      ])) {
        if (!context.gridSnappingContext) {
          context.gridSnappingContext = {};
        }
        context.gridSnappingContext.snapLocation = "top-left";
      }
    });
  }
  BpmnGridSnapping.$inject = ["eventBus"];

  // node_modules/inherits-browser/dist/index.es.js
  function e(e2, t) {
    t && (e2.super_ = t, e2.prototype = Object.create(t.prototype, { constructor: { value: e2, enumerable: false, writable: true, configurable: true } }));
  }

  // node_modules/diagram-js/lib/command/CommandInterceptor.js
  var DEFAULT_PRIORITY = 1e3;
  function CommandInterceptor(eventBus) {
    this._eventBus = eventBus;
  }
  CommandInterceptor.$inject = ["eventBus"];
  function unwrapEvent(fn, that) {
    return function(event) {
      return fn.call(that || null, event.context, event.command, event);
    };
  }
  CommandInterceptor.prototype.on = function(events, hook, priority, handlerFn, unwrap, that) {
    if (isFunction(hook) || isNumber(hook)) {
      that = unwrap;
      unwrap = handlerFn;
      handlerFn = priority;
      priority = hook;
      hook = null;
    }
    if (isFunction(priority)) {
      that = unwrap;
      unwrap = handlerFn;
      handlerFn = priority;
      priority = DEFAULT_PRIORITY;
    }
    if (isObject(unwrap)) {
      that = unwrap;
      unwrap = false;
    }
    if (!isFunction(handlerFn)) {
      throw new Error("handlerFn must be a function");
    }
    if (!isArray(events)) {
      events = [events];
    }
    var eventBus = this._eventBus;
    forEach(events, function(event) {
      var fullEvent = ["commandStack", event, hook].filter(function(e2) {
        return e2;
      }).join(".");
      eventBus.on(fullEvent, priority, unwrap ? unwrapEvent(handlerFn, that) : handlerFn, that);
    });
  };
  CommandInterceptor.prototype.canExecute = createHook("canExecute");
  CommandInterceptor.prototype.preExecute = createHook("preExecute");
  CommandInterceptor.prototype.preExecuted = createHook("preExecuted");
  CommandInterceptor.prototype.execute = createHook("execute");
  CommandInterceptor.prototype.executed = createHook("executed");
  CommandInterceptor.prototype.postExecute = createHook("postExecute");
  CommandInterceptor.prototype.postExecuted = createHook("postExecuted");
  CommandInterceptor.prototype.revert = createHook("revert");
  CommandInterceptor.prototype.reverted = createHook("reverted");
  function createHook(hook) {
    const hookFn = function(events, priority, handlerFn, unwrap, that) {
      if (isFunction(events) || isNumber(events)) {
        that = unwrap;
        unwrap = handlerFn;
        handlerFn = priority;
        priority = events;
        events = null;
      }
      this.on(events, hook, priority, handlerFn, unwrap, that);
    };
    return hookFn;
  }

  // node_modules/diagram-js/lib/features/grid-snapping/behavior/ResizeBehavior.js
  function ResizeBehavior(eventBus, gridSnapping) {
    CommandInterceptor.call(this, eventBus);
    this._gridSnapping = gridSnapping;
    var self = this;
    this.preExecute("shape.resize", function(event) {
      var context = event.context, hints = context.hints || {}, autoResize = hints.autoResize;
      if (!autoResize) {
        return;
      }
      var shape = context.shape, newBounds = context.newBounds;
      if (isString(autoResize)) {
        context.newBounds = self.snapComplex(newBounds, autoResize);
      } else {
        context.newBounds = self.snapSimple(shape, newBounds);
      }
    });
  }
  ResizeBehavior.$inject = [
    "eventBus",
    "gridSnapping",
    "modeling"
  ];
  e(ResizeBehavior, CommandInterceptor);
  ResizeBehavior.prototype.snapSimple = function(shape, newBounds) {
    var gridSnapping = this._gridSnapping;
    newBounds.width = gridSnapping.snapValue(newBounds.width, {
      min: newBounds.width
    });
    newBounds.height = gridSnapping.snapValue(newBounds.height, {
      min: newBounds.height
    });
    newBounds.x = shape.x + shape.width / 2 - newBounds.width / 2;
    newBounds.y = shape.y + shape.height / 2 - newBounds.height / 2;
    return newBounds;
  };
  ResizeBehavior.prototype.snapComplex = function(newBounds, directions) {
    if (/w|e/.test(directions)) {
      newBounds = this.snapHorizontally(newBounds, directions);
    }
    if (/n|s/.test(directions)) {
      newBounds = this.snapVertically(newBounds, directions);
    }
    return newBounds;
  };
  ResizeBehavior.prototype.snapHorizontally = function(newBounds, directions) {
    var gridSnapping = this._gridSnapping, west = /w/.test(directions), east = /e/.test(directions);
    var snappedNewBounds = {};
    snappedNewBounds.width = gridSnapping.snapValue(newBounds.width, {
      min: newBounds.width
    });
    if (east) {
      if (west) {
        snappedNewBounds.x = gridSnapping.snapValue(newBounds.x, {
          max: newBounds.x
        });
        snappedNewBounds.width += gridSnapping.snapValue(newBounds.x - snappedNewBounds.x, {
          min: newBounds.x - snappedNewBounds.x
        });
      } else {
        newBounds.x = newBounds.x + newBounds.width - snappedNewBounds.width;
      }
    }
    assign(newBounds, snappedNewBounds);
    return newBounds;
  };
  ResizeBehavior.prototype.snapVertically = function(newBounds, directions) {
    var gridSnapping = this._gridSnapping, north = /n/.test(directions), south = /s/.test(directions);
    var snappedNewBounds = {};
    snappedNewBounds.height = gridSnapping.snapValue(newBounds.height, {
      min: newBounds.height
    });
    if (north) {
      if (south) {
        snappedNewBounds.y = gridSnapping.snapValue(newBounds.y, {
          max: newBounds.y
        });
        snappedNewBounds.height += gridSnapping.snapValue(newBounds.y - snappedNewBounds.y, {
          min: newBounds.y - snappedNewBounds.y
        });
      } else {
        newBounds.y = newBounds.y + newBounds.height - snappedNewBounds.height;
      }
    }
    assign(newBounds, snappedNewBounds);
    return newBounds;
  };

  // node_modules/diagram-js/lib/features/grid-snapping/behavior/SpaceToolBehavior.js
  var HIGH_PRIORITY = 2e3;
  function SpaceToolBehavior(eventBus, gridSnapping) {
    eventBus.on([
      "spaceTool.move",
      "spaceTool.end"
    ], HIGH_PRIORITY, function(event) {
      var context = event.context;
      if (!context.initialized) {
        return;
      }
      var axis = context.axis;
      var snapped;
      if (axis === "x") {
        snapped = gridSnapping.snapValue(event.dx);
        event.x = event.x + snapped - event.dx;
        event.dx = snapped;
      } else {
        snapped = gridSnapping.snapValue(event.dy);
        event.y = event.y + snapped - event.dy;
        event.dy = snapped;
      }
    });
  }
  SpaceToolBehavior.$inject = [
    "eventBus",
    "gridSnapping"
  ];

  // node_modules/diagram-js/lib/features/grid-snapping/behavior/index.js
  var behavior_default = {
    __init__: [
      "gridSnappingResizeBehavior",
      "gridSnappingSpaceToolBehavior"
    ],
    gridSnappingResizeBehavior: ["type", ResizeBehavior],
    gridSnappingSpaceToolBehavior: ["type", SpaceToolBehavior]
  };

  // node_modules/diagram-js/lib/features/snapping/SnapUtil.js
  function isSnapped(event, axis) {
    var snapped = event.snapped;
    if (!snapped) {
      return false;
    }
    if (typeof axis === "string") {
      return snapped[axis];
    }
    return snapped.x && snapped.y;
  }
  function setSnapped(event, axis, value) {
    if (typeof axis !== "string") {
      throw new Error("axis must be in [x, y]");
    }
    if (typeof value !== "number" && value !== false) {
      throw new Error("value must be Number or false");
    }
    var delta, previousValue = event[axis];
    var snapped = event.snapped = event.snapped || {};
    if (value === false) {
      snapped[axis] = false;
    } else {
      snapped[axis] = true;
      delta = value - previousValue;
      event[axis] += delta;
      event["d" + axis] += delta;
    }
    return previousValue;
  }

  // node_modules/diagram-js/lib/features/keyboard/KeyboardUtil.js
  function isCmd(event) {
    if (event.altKey) {
      return false;
    }
    return event.ctrlKey || event.metaKey;
  }

  // node_modules/diagram-js/lib/features/grid-snapping/GridUtil.js
  var SPACING = 10;
  function quantize(value, quantum, fn) {
    if (!fn) {
      fn = "round";
    }
    return Math[fn](value / quantum) * quantum;
  }

  // node_modules/diagram-js/lib/features/grid-snapping/GridSnapping.js
  var LOWER_PRIORITY = 1200;
  var LOW_PRIORITY = 800;
  function GridSnapping(elementRegistry, eventBus, config) {
    var active = !config || config.active !== false;
    this._eventBus = eventBus;
    var self = this;
    eventBus.on("diagram.init", LOW_PRIORITY, function() {
      self.setActive(active);
    });
    eventBus.on([
      "create.move",
      "create.end",
      "bendpoint.move.move",
      "bendpoint.move.end",
      "connect.move",
      "connect.end",
      "connectionSegment.move.move",
      "connectionSegment.move.end",
      "resize.move",
      "resize.end",
      "shape.move.move",
      "shape.move.end"
    ], LOWER_PRIORITY, function(event) {
      var originalEvent = event.originalEvent;
      if (!self.active || originalEvent && isCmd(originalEvent)) {
        return;
      }
      var context = event.context, gridSnappingContext = context.gridSnappingContext;
      if (!gridSnappingContext) {
        gridSnappingContext = context.gridSnappingContext = {};
      }
      ["x", "y"].forEach(function(axis) {
        var options = {};
        var snapOffset = getSnapOffset(event, axis, elementRegistry);
        if (snapOffset) {
          options.offset = snapOffset;
        }
        var snapConstraints = getSnapConstraints(event, axis);
        if (snapConstraints) {
          assign(options, snapConstraints);
        }
        if (!isSnapped(event, axis)) {
          self.snapEvent(event, axis, options);
        }
      });
    });
  }
  GridSnapping.prototype.snapEvent = function(event, axis, options) {
    var snappedValue = this.snapValue(event[axis], options);
    setSnapped(event, axis, snappedValue);
  };
  GridSnapping.prototype.getGridSpacing = function() {
    return SPACING;
  };
  GridSnapping.prototype.snapValue = function(value, options) {
    var offset = 0;
    if (options && options.offset) {
      offset = options.offset;
    }
    value += offset;
    value = quantize(value, SPACING);
    var min, max;
    if (options && options.min) {
      min = options.min;
      if (isNumber(min)) {
        min = quantize(min + offset, SPACING, "ceil");
        value = Math.max(value, min);
      }
    }
    if (options && options.max) {
      max = options.max;
      if (isNumber(max)) {
        max = quantize(max + offset, SPACING, "floor");
        value = Math.min(value, max);
      }
    }
    value -= offset;
    return value;
  };
  GridSnapping.prototype.isActive = function() {
    return this.active;
  };
  GridSnapping.prototype.setActive = function(active) {
    this.active = active;
    this._eventBus.fire("gridSnapping.toggle", { active });
  };
  GridSnapping.prototype.toggleActive = function() {
    this.setActive(!this.active);
  };
  GridSnapping.$inject = [
    "elementRegistry",
    "eventBus",
    "config.gridSnapping"
  ];
  function getSnapConstraints(event, axis) {
    var context = event.context, createConstraints = context.createConstraints, resizeConstraints = context.resizeConstraints || {}, gridSnappingContext = context.gridSnappingContext, snapConstraints = gridSnappingContext.snapConstraints;
    if (snapConstraints && snapConstraints[axis]) {
      return snapConstraints[axis];
    }
    if (!snapConstraints) {
      snapConstraints = gridSnappingContext.snapConstraints = {};
    }
    if (!snapConstraints[axis]) {
      snapConstraints[axis] = {};
    }
    var direction = context.direction;
    if (createConstraints) {
      if (isHorizontal2(axis)) {
        snapConstraints.x.min = createConstraints.left;
        snapConstraints.x.max = createConstraints.right;
      } else {
        snapConstraints.y.min = createConstraints.top;
        snapConstraints.y.max = createConstraints.bottom;
      }
    }
    var minResizeConstraints = resizeConstraints.min, maxResizeConstraints = resizeConstraints.max;
    if (minResizeConstraints) {
      if (isHorizontal2(axis)) {
        if (isWest(direction)) {
          snapConstraints.x.max = minResizeConstraints.left;
        } else {
          snapConstraints.x.min = minResizeConstraints.right;
        }
      } else {
        if (isNorth(direction)) {
          snapConstraints.y.max = minResizeConstraints.top;
        } else {
          snapConstraints.y.min = minResizeConstraints.bottom;
        }
      }
    }
    if (maxResizeConstraints) {
      if (isHorizontal2(axis)) {
        if (isWest(direction)) {
          snapConstraints.x.min = maxResizeConstraints.left;
        } else {
          snapConstraints.x.max = maxResizeConstraints.right;
        }
      } else {
        if (isNorth(direction)) {
          snapConstraints.y.min = maxResizeConstraints.top;
        } else {
          snapConstraints.y.max = maxResizeConstraints.bottom;
        }
      }
    }
    return snapConstraints[axis];
  }
  function getSnapOffset(event, axis, elementRegistry) {
    var context = event.context, shape = event.shape, gridSnappingContext = context.gridSnappingContext, snapLocation = gridSnappingContext.snapLocation, snapOffset = gridSnappingContext.snapOffset;
    if (snapOffset && isNumber(snapOffset[axis])) {
      return snapOffset[axis];
    }
    if (!snapOffset) {
      snapOffset = gridSnappingContext.snapOffset = {};
    }
    if (!isNumber(snapOffset[axis])) {
      snapOffset[axis] = 0;
    }
    if (!shape) {
      return snapOffset[axis];
    }
    if (!elementRegistry.get(shape.id)) {
      if (isHorizontal2(axis)) {
        snapOffset[axis] += shape[axis] + shape.width / 2;
      } else {
        snapOffset[axis] += shape[axis] + shape.height / 2;
      }
    }
    if (!snapLocation) {
      return snapOffset[axis];
    }
    if (axis === "x") {
      if (/left/.test(snapLocation)) {
        snapOffset[axis] -= shape.width / 2;
      } else if (/right/.test(snapLocation)) {
        snapOffset[axis] += shape.width / 2;
      }
    } else {
      if (/top/.test(snapLocation)) {
        snapOffset[axis] -= shape.height / 2;
      } else if (/bottom/.test(snapLocation)) {
        snapOffset[axis] += shape.height / 2;
      }
    }
    return snapOffset[axis];
  }
  function isHorizontal2(axis) {
    return axis === "x";
  }
  function isNorth(direction) {
    return direction.indexOf("n") !== -1;
  }
  function isWest(direction) {
    return direction.indexOf("w") !== -1;
  }

  // node_modules/diagram-js/lib/features/grid-snapping/index.js
  var grid_snapping_default = {
    __depends__: [behavior_default],
    __init__: ["gridSnapping"],
    gridSnapping: ["type", GridSnapping]
  };

  // node_modules/diagram-js/lib/util/Geometry.js
  var ALIGNED_THRESHOLD = 2;
  function pointsAligned(a, b) {
    var points = Array.from(arguments).flat();
    const axisMap = {
      "x": "v",
      "y": "h"
    };
    for (const [axis, orientation] of Object.entries(axisMap)) {
      if (pointsAlignedOnAxis(axis, points)) {
        return orientation;
      }
    }
    return false;
  }
  function pointsAlignedOnAxis(axis, points) {
    const referencePoint = points[0];
    return every(points, function(point) {
      return Math.abs(referencePoint[axis] - point[axis]) <= ALIGNED_THRESHOLD;
    });
  }

  // node_modules/path-intersection/intersect.js
  var math = Math;
  var PI = math.PI;
  var mmin = math.min;
  var mmax = math.max;
  var pow = math.pow;
  var abs = math.abs;
  var arcNumber = "-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
  var arcSeparator = "[\\s]*,?[\\s]*";
  var arcValues = new RegExp(
    "(?=(" + arcNumber + "))\\1" + arcSeparator + "(?=(" + arcNumber + "))\\2" + arcSeparator + "(?=(" + arcNumber + "))\\3" + arcSeparator + "([01])" + arcSeparator + "([01])" + arcSeparator + "(?=(" + arcNumber + "))\\6" + arcSeparator + "(?=(" + arcNumber + "))\\7" + arcSeparator,
    "g"
  );

  // node_modules/diagram-js/lib/util/ModelUtil.js
  function isConnection(value) {
    return isObject(value) && has(value, "waypoints");
  }

  // node_modules/diagram-js/lib/layout/LayoutUtil.js
  function roundPoint(point) {
    return {
      x: Math.round(point.x),
      y: Math.round(point.y)
    };
  }
  function asTRBL(bounds) {
    return {
      top: bounds.y,
      right: bounds.x + (bounds.width || 0),
      bottom: bounds.y + (bounds.height || 0),
      left: bounds.x
    };
  }
  function getBoundsMid(bounds) {
    return roundPoint({
      x: bounds.x + (bounds.width || 0) / 2,
      y: bounds.y + (bounds.height || 0) / 2
    });
  }
  function getConnectionMid(connection) {
    var waypoints = connection.waypoints;
    var parts = waypoints.reduce(function(parts2, point, index) {
      var lastPoint = waypoints[index - 1];
      if (lastPoint) {
        var lastPart = parts2[parts2.length - 1];
        var startLength = lastPart && lastPart.endLength || 0;
        var length = distance(lastPoint, point);
        parts2.push({
          start: lastPoint,
          end: point,
          startLength,
          endLength: startLength + length,
          length
        });
      }
      return parts2;
    }, []);
    var totalLength = parts.reduce(function(length, part) {
      return length + part.length;
    }, 0);
    var midLength = totalLength / 2;
    var i = 0;
    var midSegment = parts[i];
    while (midSegment.endLength < midLength) {
      midSegment = parts[++i];
    }
    var segmentProgress = (midLength - midSegment.startLength) / midSegment.length;
    var midPoint = {
      x: midSegment.start.x + (midSegment.end.x - midSegment.start.x) * segmentProgress,
      y: midSegment.start.y + (midSegment.end.y - midSegment.start.y) * segmentProgress
    };
    return midPoint;
  }
  function getMid(element) {
    if (isConnection(element)) {
      return getConnectionMid(element);
    }
    return getBoundsMid(element);
  }
  function getOrientation(rect, reference, padding) {
    padding = padding || 0;
    if (!isObject(padding)) {
      padding = { x: padding, y: padding };
    }
    var rectOrientation = asTRBL(rect), referenceOrientation = asTRBL(reference);
    var top = rectOrientation.bottom + padding.y <= referenceOrientation.top, right = rectOrientation.left - padding.x >= referenceOrientation.right, bottom = rectOrientation.top - padding.y >= referenceOrientation.bottom, left = rectOrientation.right + padding.x <= referenceOrientation.left;
    var vertical = top ? "top" : bottom ? "bottom" : null, horizontal = left ? "left" : right ? "right" : null;
    if (horizontal && vertical) {
      return vertical + "-" + horizontal;
    } else {
      return horizontal || vertical || "intersect";
    }
  }
  function distance(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  // node_modules/diagram-js/lib/features/auto-place/AutoPlaceUtil.js
  var PLACEMENT_DETECTION_PAD = 10;
  var DEFAULT_DISTANCE = 50;
  var DEFAULT_MAX_DISTANCE = 250;
  function findFreePosition(source, element, position, getNextPosition) {
    var connectedAtPosition;
    while (connectedAtPosition = getConnectedAtPosition(source, position, element)) {
      position = getNextPosition(element, position, connectedAtPosition);
    }
    return position;
  }
  function generateGetNextPosition(nextPositionDirection) {
    return function(element, previousPosition, connectedAtPosition) {
      var nextPosition = {
        x: previousPosition.x,
        y: previousPosition.y
      };
      ["x", "y"].forEach(function(axis) {
        var nextPositionDirectionForAxis = nextPositionDirection[axis];
        if (!nextPositionDirectionForAxis) {
          return;
        }
        var dimension = axis === "x" ? "width" : "height";
        var margin = nextPositionDirectionForAxis.margin, minDistance = nextPositionDirectionForAxis.minDistance;
        if (margin < 0) {
          nextPosition[axis] = Math.min(
            connectedAtPosition[axis] + margin - element[dimension] / 2,
            previousPosition[axis] - minDistance + margin
          );
        } else {
          nextPosition[axis] = Math.max(
            connectedAtPosition[axis] + connectedAtPosition[dimension] + margin + element[dimension] / 2,
            previousPosition[axis] + minDistance + margin
          );
        }
      });
      return nextPosition;
    };
  }
  function getConnectedAtPosition(source, position, element) {
    var bounds = {
      x: position.x - element.width / 2,
      y: position.y - element.height / 2,
      width: element.width,
      height: element.height
    };
    var closure = getAutoPlaceClosure(source);
    return find(closure, function(target) {
      if (target === element) {
        return false;
      }
      var orientation = getOrientation(target, bounds, PLACEMENT_DETECTION_PAD);
      return orientation === "intersect";
    });
  }
  function getConnectedDistance(source, hints) {
    if (!hints) {
      hints = {};
    }
    function getDefaultWeight(connection) {
      return connection.source === source ? 1 : -1;
    }
    var defaultDistance = hints.defaultDistance || DEFAULT_DISTANCE, direction = hints.direction || "e", filter2 = hints.filter, getWeight = hints.getWeight || getDefaultWeight, maxDistance = hints.maxDistance || DEFAULT_MAX_DISTANCE, reference = hints.reference || "start";
    if (!filter2) {
      filter2 = noneFilter;
    }
    function getDistance2(a, b) {
      if (direction === "n") {
        if (reference === "start") {
          return asTRBL(a).top - asTRBL(b).bottom;
        } else if (reference === "center") {
          return asTRBL(a).top - getMid(b).y;
        } else {
          return asTRBL(a).top - asTRBL(b).top;
        }
      } else if (direction === "w") {
        if (reference === "start") {
          return asTRBL(a).left - asTRBL(b).right;
        } else if (reference === "center") {
          return asTRBL(a).left - getMid(b).x;
        } else {
          return asTRBL(a).left - asTRBL(b).left;
        }
      } else if (direction === "s") {
        if (reference === "start") {
          return asTRBL(b).top - asTRBL(a).bottom;
        } else if (reference === "center") {
          return getMid(b).y - asTRBL(a).bottom;
        } else {
          return asTRBL(b).bottom - asTRBL(a).bottom;
        }
      } else {
        if (reference === "start") {
          return asTRBL(b).left - asTRBL(a).right;
        } else if (reference === "center") {
          return getMid(b).x - asTRBL(a).right;
        } else {
          return asTRBL(b).right - asTRBL(a).right;
        }
      }
    }
    var sourcesDistances = source.incoming.filter(filter2).map(function(connection) {
      var weight = getWeight(connection);
      var distance2 = weight < 0 ? getDistance2(connection.source, source) : getDistance2(source, connection.source);
      return {
        id: connection.source.id,
        distance: distance2,
        weight
      };
    });
    var targetsDistances = source.outgoing.filter(filter2).map(function(connection) {
      var weight = getWeight(connection);
      var distance2 = weight > 0 ? getDistance2(source, connection.target) : getDistance2(connection.target, source);
      return {
        id: connection.target.id,
        distance: distance2,
        weight
      };
    });
    var distances = sourcesDistances.concat(targetsDistances).reduce(function(accumulator, currentValue) {
      accumulator[currentValue.id + "__weight_" + currentValue.weight] = currentValue;
      return accumulator;
    }, {});
    var distancesGrouped = reduce(distances, function(accumulator, currentValue) {
      var distance2 = currentValue.distance, weight = currentValue.weight;
      if (distance2 < 0 || distance2 > maxDistance) {
        return accumulator;
      }
      if (!accumulator[String(distance2)]) {
        accumulator[String(distance2)] = 0;
      }
      accumulator[String(distance2)] += 1 * weight;
      if (!accumulator.distance || accumulator[accumulator.distance] < accumulator[String(distance2)]) {
        accumulator.distance = distance2;
      }
      return accumulator;
    }, {});
    return distancesGrouped.distance || defaultDistance;
  }
  function getAutoPlaceClosure(source) {
    var allConnected = getConnected(source);
    if (source.host) {
      allConnected = allConnected.concat(getConnected(source.host));
    }
    if (source.attachers) {
      allConnected = allConnected.concat(source.attachers.reduce(function(shapes, attacher) {
        return shapes.concat(getConnected(attacher));
      }, []));
    }
    return allConnected;
  }
  function getConnected(element) {
    return getTargets(element).concat(getSources(element));
  }
  function getSources(shape) {
    return shape.incoming.map(function(connection) {
      return connection.source;
    });
  }
  function getTargets(shape) {
    return shape.outgoing.map(function(connection) {
      return connection.target;
    });
  }
  function noneFilter() {
    return true;
  }

  // node_modules/bpmn-js/lib/features/auto-place/BpmnAutoPlaceUtil.js
  function getNewShapePosition(source, element, elementRegistry) {
    var placeHorizontally = isDirectionHorizontal(source, elementRegistry);
    if (is2(element, "bpmn:TextAnnotation")) {
      return getTextAnnotationPosition(source, element, placeHorizontally);
    }
    if (isAny(element, ["bpmn:DataObjectReference", "bpmn:DataStoreReference"])) {
      return getDataElementPosition(source, element, placeHorizontally);
    }
    if (is2(element, "bpmn:FlowNode")) {
      return getFlowNodePosition(source, element, placeHorizontally);
    }
  }
  function getFlowNodePosition(source, element, placeHorizontally) {
    var sourceTrbl = asTRBL(source);
    var sourceMid = getMid(source);
    var placement = placeHorizontally ? {
      directionHint: "e",
      minDistance: 80,
      baseOrientation: "left",
      boundaryOrientation: "top",
      start: "top",
      end: "bottom"
    } : {
      directionHint: "s",
      minDistance: 90,
      baseOrientation: "top",
      boundaryOrientation: "left",
      start: "left",
      end: "right"
    };
    var connectedDistance = getConnectedDistance(source, {
      filter: function(connection) {
        return is2(connection, "bpmn:SequenceFlow");
      },
      direction: placement.directionHint
    });
    var margin = 30, minDistance = placement.minDistance, orientation = placement.baseOrientation;
    if (is2(source, "bpmn:BoundaryEvent")) {
      orientation = getOrientation(source, source.host, -25);
      if (orientation.indexOf(placement.boundaryOrientation) !== -1) {
        margin *= -1;
      }
    }
    var position = placeHorizontally ? {
      x: sourceTrbl.right + connectedDistance + element.width / 2,
      y: sourceMid.y + getDistance(orientation, minDistance, placement)
    } : {
      x: sourceMid.x + getDistance(orientation, minDistance, placement),
      y: sourceTrbl.bottom + connectedDistance + element.height / 2
    };
    var nextPosition = {
      margin,
      minDistance
    };
    var nextPositionDirection = placeHorizontally ? {
      y: nextPosition
    } : {
      x: nextPosition
    };
    return findFreePosition(source, element, position, generateGetNextPosition(nextPositionDirection));
  }
  function getDistance(orientation, minDistance, placement) {
    if (orientation.includes(placement.start)) {
      return -1 * minDistance;
    } else if (orientation.includes(placement.end)) {
      return minDistance;
    } else {
      return 0;
    }
  }
  function getTextAnnotationPosition(source, element, placeHorizontally) {
    var sourceTrbl = asTRBL(source);
    var position = placeHorizontally ? {
      x: sourceTrbl.right + element.width / 2,
      y: sourceTrbl.top - 50 - element.height / 2
    } : {
      x: sourceTrbl.right + 50 + element.width / 2,
      y: sourceTrbl.bottom + element.height / 2
    };
    if (isConnection(source)) {
      position = getMid(source);
      if (placeHorizontally) {
        position.x += 100;
        position.y -= 50;
      } else {
        position.x += 100;
        position.y += 50;
      }
    }
    var nextPosition = {
      margin: placeHorizontally ? -30 : 30,
      minDistance: 20
    };
    var nextPositionDirection = placeHorizontally ? {
      y: nextPosition
    } : {
      x: nextPosition
    };
    return findFreePosition(source, element, position, generateGetNextPosition(nextPositionDirection));
  }
  function getDataElementPosition(source, element, placeHorizontally) {
    var sourceTrbl = asTRBL(source);
    var position = placeHorizontally ? {
      x: sourceTrbl.right - 10 + element.width / 2,
      y: sourceTrbl.bottom + 40 + element.width / 2
    } : {
      x: sourceTrbl.left - 40 - element.width / 2,
      y: sourceTrbl.bottom - 10 + element.height / 2
    };
    var nextPosition = {
      margin: 30,
      minDistance: 30
    };
    var nextPositionDirection = placeHorizontally ? {
      x: nextPosition
    } : {
      y: nextPosition
    };
    return findFreePosition(source, element, position, generateGetNextPosition(nextPositionDirection));
  }

  // node_modules/bpmn-js/lib/features/grid-snapping/behavior/GridSnappingAutoPlaceBehavior.js
  var HIGH_PRIORITY2 = 2e3;
  function GridSnappingAutoPlaceBehavior(eventBus, gridSnapping, elementRegistry) {
    eventBus.on("autoPlace", HIGH_PRIORITY2, function(context) {
      var source = context.source, sourceMid = getMid(source), shape = context.shape;
      var position = getNewShapePosition(source, shape, elementRegistry);
      ["x", "y"].forEach(function(axis) {
        var options = {};
        if (position[axis] === sourceMid[axis]) {
          return;
        }
        if (position[axis] > sourceMid[axis]) {
          options.min = position[axis];
        } else {
          options.max = position[axis];
        }
        if (is2(shape, "bpmn:TextAnnotation")) {
          if (isHorizontal3(axis)) {
            options.offset = -shape.width / 2;
          } else {
            options.offset = -shape.height / 2;
          }
        }
        position[axis] = gridSnapping.snapValue(position[axis], options);
      });
      return position;
    });
  }
  GridSnappingAutoPlaceBehavior.$inject = [
    "eventBus",
    "gridSnapping",
    "elementRegistry"
  ];
  function isHorizontal3(axis) {
    return axis === "x";
  }

  // node_modules/bpmn-js/lib/features/grid-snapping/behavior/GridSnappingParticipantBehavior.js
  var HIGHER_PRIORITY = 1750;
  function GridSnappingParticipantBehavior(canvas, eventBus, gridSnapping) {
    eventBus.on([
      "create.start",
      "shape.move.start"
    ], HIGHER_PRIORITY, function(event) {
      var context = event.context, shape = context.shape, rootElement = canvas.getRootElement();
      if (!is2(shape, "bpmn:Participant") || !is2(rootElement, "bpmn:Process") || !rootElement.children.length) {
        return;
      }
      var createConstraints = context.createConstraints;
      if (!createConstraints) {
        return;
      }
      shape.width = gridSnapping.snapValue(shape.width, { min: shape.width });
      shape.height = gridSnapping.snapValue(shape.height, { min: shape.height });
    });
  }
  GridSnappingParticipantBehavior.$inject = [
    "canvas",
    "eventBus",
    "gridSnapping"
  ];

  // node_modules/bpmn-js/lib/features/grid-snapping/behavior/GridSnappingLayoutConnectionBehavior.js
  var HIGH_PRIORITY3 = 3e3;
  function GridSnappingLayoutConnectionBehavior(eventBus, gridSnapping, modeling) {
    CommandInterceptor.call(this, eventBus);
    this._gridSnapping = gridSnapping;
    var self = this;
    this.postExecuted([
      "connection.create",
      "connection.layout"
    ], HIGH_PRIORITY3, function(event) {
      var context = event.context, connection = context.connection, hints = context.hints || {}, waypoints = connection.waypoints;
      if (hints.connectionStart || hints.connectionEnd || hints.createElementsBehavior === false) {
        return;
      }
      if (!hasMiddleSegments(waypoints)) {
        return;
      }
      modeling.updateWaypoints(connection, self.snapMiddleSegments(waypoints));
    });
  }
  GridSnappingLayoutConnectionBehavior.$inject = [
    "eventBus",
    "gridSnapping",
    "modeling"
  ];
  e(GridSnappingLayoutConnectionBehavior, CommandInterceptor);
  GridSnappingLayoutConnectionBehavior.prototype.snapMiddleSegments = function(waypoints) {
    var gridSnapping = this._gridSnapping, snapped;
    waypoints = waypoints.slice();
    for (var i = 1; i < waypoints.length - 2; i++) {
      snapped = snapSegment(gridSnapping, waypoints[i], waypoints[i + 1]);
      waypoints[i] = snapped[0];
      waypoints[i + 1] = snapped[1];
    }
    return waypoints;
  };
  function hasMiddleSegments(waypoints) {
    return waypoints.length > 3;
  }
  function horizontallyAligned(aligned) {
    return aligned === "h";
  }
  function verticallyAligned(aligned) {
    return aligned === "v";
  }
  function snapSegment(gridSnapping, segmentStart, segmentEnd) {
    var aligned = pointsAligned(segmentStart, segmentEnd);
    var snapped = {};
    if (horizontallyAligned(aligned)) {
      snapped.y = gridSnapping.snapValue(segmentStart.y);
    }
    if (verticallyAligned(aligned)) {
      snapped.x = gridSnapping.snapValue(segmentStart.x);
    }
    if ("x" in snapped || "y" in snapped) {
      segmentStart = assign({}, segmentStart, snapped);
      segmentEnd = assign({}, segmentEnd, snapped);
    }
    return [segmentStart, segmentEnd];
  }

  // node_modules/bpmn-js/lib/features/grid-snapping/behavior/index.js
  var behavior_default2 = {
    __init__: [
      "gridSnappingAutoPlaceBehavior",
      "gridSnappingParticipantBehavior",
      "gridSnappingLayoutConnectionBehavior"
    ],
    gridSnappingAutoPlaceBehavior: ["type", GridSnappingAutoPlaceBehavior],
    gridSnappingParticipantBehavior: ["type", GridSnappingParticipantBehavior],
    gridSnappingLayoutConnectionBehavior: ["type", GridSnappingLayoutConnectionBehavior]
  };

  // node_modules/bpmn-js/lib/features/grid-snapping/index.js
  var grid_snapping_default2 = {
    __depends__: [
      grid_snapping_default,
      behavior_default2
    ],
    __init__: ["bpmnGridSnapping"],
    bpmnGridSnapping: ["type", BpmnGridSnapping]
  };

  // scripts/sheets-import-entry.js
  window.NaraImportBpmnDiagram = importBpmnDiagram;
  window.NaraGridModule = grid_snapping_default2;
})();
