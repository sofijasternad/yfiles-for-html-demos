/****************************************************************************
 ** @license
 ** This demo file is part of yFiles for HTML 2.6.
 ** Copyright (c) 2000-2023 by yWorks GmbH, Vor dem Kreuzberg 28,
 ** 72070 Tuebingen, Germany. All rights reserved.
 **
 ** yFiles demo files exhibit yFiles for HTML functionalities. Any redistribution
 ** of demo files in source code or binary form, with or without
 ** modification, is not permitted.
 **
 ** Owners of a valid software license for a yFiles for HTML version that this
 ** demo is shipped with are allowed to use the demo source code as basis
 ** for their own yFiles for HTML powered applications. Use of such programs is
 ** governed by the rights and conditions as set out in the yFiles for HTML
 ** license agreement.
 **
 ** THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESS OR IMPLIED
 ** WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 ** MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN
 ** NO EVENT SHALL yWorks BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 ** SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 ** TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 ** PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 ** LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 ** NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 ** SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 **
 ***************************************************************************/
import {
  Class,
  DefaultGraph,
  GraphComponent,
  GraphCopier,
  GraphEditorInputMode,
  GraphInputMode,
  GraphMLSupport,
  GraphOverviewComponent,
  GraphSnapContext,
  GridSnapTypes,
  IArrow,
  ICommand,
  IEdge,
  IEnumerable,
  IGraph,
  IInputMode,
  ILabel,
  ILabelOwner,
  ImageNodeStyle,
  IModelItem,
  INode,
  LabelSnapContext,
  License,
  List,
  OrthogonalEdgeEditingContext,
  Point,
  PolylineEdgeStyle,
  PopulateItemContextMenuEventArgs,
  Rect,
  RenderModes,
  SmartEdgeLabelModel,
  StorageLocation,
  Stroke,
  TableNodeStyle,
  WebGL2GraphModelManager
} from 'yfiles'
import { OptionEditor } from 'demo-resources/demo-option-editor'
import HierarchicLayoutConfig from './HierarchicLayoutConfig.js'
import OrganicLayoutConfig from './OrganicLayoutConfig.js'
import OrthogonalLayoutConfig from './OrthogonalLayoutConfig.js'
import CircularLayoutConfig from './CircularLayoutConfig.js'
import TreeLayoutConfig from './TreeLayoutConfig.js'
import ClassicTreeLayoutConfig from './ClassicTreeLayoutConfig.js'
import BalloonLayoutConfig from './BalloonLayoutConfig.js'
import RadialLayoutConfig from './RadialLayoutConfig.js'
import SeriesParallelLayoutConfig from './SeriesParallelLayoutConfig.js'
import PolylineEdgeRouterConfig from './PolylineEdgeRouterConfig.js'
import ChannelEdgeRouterConfig from './ChannelEdgeRouterConfig.js'
import BusEdgeRouterConfig from './BusEdgeRouterConfig.js'
import OrganicEdgeRouterConfig from './OrganicEdgeRouterConfig.js'
import ParallelEdgeRouterConfig from './ParallelEdgeRouterConfig.js'
import LabelingConfig from './LabelingConfig.js'
import ComponentLayoutConfig from './ComponentLayoutConfig.js'
import TabularLayoutConfig from './TabularLayoutConfig.js'
import PartialLayoutConfig from './PartialLayoutConfig.js'
import GraphTransformerConfig from './GraphTransformerConfig.js'
import CompactDiskLayoutConfig from './CompactDiskLayoutConfig.js'
import { PresetsUiBuilder } from './PresetsUiBuilder.js'
import { ContextMenu } from 'demo-utils/ContextMenu'
import { createConfiguredGraphMLIOHandler } from 'demo-utils/FaultTolerantGraphMLIOHandler'
import { isSeparator, LayoutStyles, Presets } from './resources/LayoutSamples.js'
import { LoremIpsum } from './resources/LoremIpsum.js'
import {
  applyDemoTheme,
  createDemoEdgeStyle,
  createDemoGroupStyle,
  createDemoNodeStyle,
  DemoStyleOverviewPaintable,
  initDemoStyles
} from 'demo-resources/demo-styles'
import { fetchLicense } from 'demo-resources/fetch-license'
import { BrowserDetection } from 'demo-utils/BrowserDetection'
import { configureTwoPointerPanning } from 'demo-utils/configure-two-pointer-panning'
import { addNavigationButtons, bindYFilesCommand, finishLoading } from 'demo-resources/demo-page'

// We need to load the 'styles-other' module explicitly to prevent tree-shaking
// tools from removing this dependency which is needed for loading all library styles.
Class.ensure(ImageNodeStyle)

/**
 * The GraphComponent
 * @type {GraphComponent}
 */
let graphComponent

/**
 * The overview component
 * @type {GraphOverviewComponent}
 */
let overviewComponent

/**
 * The option editor that stores the currently selected layout configuration.
 * @type {OptionEditor}
 */
let optionEditor
/** @type {PresetsUiBuilder} */
let presetsUiBuilder

/** @type {boolean} */
let configOptionsValid = false
/** @type {boolean} */
let inLayout = false
/** @type {boolean} */
let inLoadSample = false

const comboBoxSeparatorItem = '-----------'

// get hold of some UI elements
const layoutComboBox = document.querySelector(`#layout-select-box`)
addNavigationButtons(layoutComboBox, true, false, 'sidebar-button')
const sampleComboBox = document.querySelector(`#sample-select-box`)
const layoutButton = document.querySelector(`#apply-layout-button`)

// keep track of user interactions with the graph
/** @type {boolean} */
let customGraphSelected = false
/** @type {IGraph} */
let customGraph = null

/**
 * @returns {!Promise}
 */
async function run() {
  License.value = await fetchLicense()
  // initialize the GraphComponent
  graphComponent = new GraphComponent('graphComponent')
  applyDemoTheme(graphComponent, { scale: 1 })

  // initialize the GraphOverviewComponent
  overviewComponent = new GraphOverviewComponent('overviewComponent', graphComponent)

  // wire up the UI
  initializeUI()

  configOptionsValid = true

  // we start loading the input mode
  graphComponent.inputMode = createEditorMode()

  // use two finger panning to allow easier editing with touch gestures
  configureTwoPointerPanning(graphComponent)

  // use the file system for built-in I/O
  enableGraphML()
  // initialize the property editor
  const editorElement = document.querySelector(`#data-editor`)
  optionEditor = new OptionEditor(editorElement)

  // initialize the presets UI builder
  presetsUiBuilder = new PresetsUiBuilder({
    rootElement: document.querySelector(`#data-presets`),
    optionEditor: optionEditor,
    presetDefs: Presets,
    onPresetApplied: () => applyLayout(false)
  })

  // disable UI during initialization
  setUIDisabled(true)

  // initialize the graph and the defaults
  initializeGraph()

  // configure overview panel
  overviewComponent.graphVisualCreator = new DemoStyleOverviewPaintable(graphComponent.graph)

  // after the initial graph is loaded, we continue loading with the algorithms
  initializeLayoutAlgorithms()

  await initializeApplicationFromUrl()

  updateStyleDefaults(graphComponent.graph)
}

/**
 * Enables loading and saving the graph to GraphML.
 */
function enableGraphML() {
  const graphMLIOHandler = createConfiguredGraphMLIOHandler()
  graphMLIOHandler.addParsedListener((_, evt) => {
    updateModifiedGraphSample()
  })
  new GraphMLSupport({
    graphComponent,
    // configure to load and save to the file system
    storageLocation: StorageLocation.FILE_SYSTEM,
    graphMLIOHandler: graphMLIOHandler
  })
}

/**
 * Populates the sample combobox depending on the chosen layout algorithm.
 * @param {!string} layoutName
 */
function initializeSamples(layoutName) {
  const selectedLayout = LayoutStyles.find(
    (entry) => !isSeparator(entry) && getNormalizedName(entry.layout) === layoutName
  )
  if (selectedLayout) {
    const files = [...selectedLayout.samples]
    if (customGraph !== null) {
      files.push({ label: 'Modified Graph', sample: 'modified-graph' })
    }
    initializeComboBox(sampleComboBox, files)
    if (customGraphSelected) {
      sampleComboBox.selectedIndex = sampleComboBox.options.length - 1
    }
  }
}

/**
 * Loads all layout modules and populates the layout combo box.
 */
function initializeLayoutAlgorithms() {
  const layoutNames = LayoutStyles.map((entry) =>
    isSeparator(entry) ? comboBoxSeparatorItem : entry.layout
  )
  initializeComboBox(layoutComboBox, layoutNames)
}

/**
 * Creates a new instance of the configuration for the layout algorithm with the given name.
 * @param {!string} normalizedName The name of the layout algorithm for which a configuration is created.
 * @returns {!LayoutConfigurationType}
 */
function createLayoutConfig(normalizedName) {
  switch (normalizedName) {
    case 'balloon':
      return new BalloonLayoutConfig()
    case 'bus-router':
      return new BusEdgeRouterConfig()
    case 'channel-router':
      return new ChannelEdgeRouterConfig()
    case 'circular':
      return new CircularLayoutConfig()
    case 'components':
      return new ComponentLayoutConfig()
    case 'edge-router':
      return new PolylineEdgeRouterConfig()
    case 'graph-transform':
      return new GraphTransformerConfig()
    case 'hierarchic':
      return new HierarchicLayoutConfig()
    case 'labeling':
      return new LabelingConfig()
    case 'organic':
      return new OrganicLayoutConfig()
    case 'organic-router':
      return new OrganicEdgeRouterConfig()
    case 'orthogonal':
      return new OrthogonalLayoutConfig()
    case 'series-parallel':
      return new SeriesParallelLayoutConfig()
    case 'partial':
      return new PartialLayoutConfig()
    case 'radial':
      return new RadialLayoutConfig()
    case 'compact-disk':
      return new CompactDiskLayoutConfig()
    case 'parallel-router':
      return new ParallelEdgeRouterConfig()
    case 'tabular':
      return new TabularLayoutConfig()
    case 'tree':
      return new TreeLayoutConfig()
    case 'classic-tree':
      return new ClassicTreeLayoutConfig()
    default:
      return new HierarchicLayoutConfig()
  }
}

/**
 * Returns the index of the first option with the given value.
 * @param {!HTMLSelectElement} combobox The combobox to search.
 * @param {!string} value The value to match.
 * @returns {number} The index of the first option with the given text (ignoring case), or -1 if no
 *   such option exists.
 */
function getIndexInComboBox(combobox, value) {
  const normalizedText = getNormalizedName(value)
  const options = combobox.options
  for (let i = 0; i < options.length; i++) {
    if (options[i].value === normalizedText) {
      return i
    }
  }
  return -1
}

/**
 * Populates the given HTMLSelectElement with the items in the given string array.
 * @param {!HTMLSelectElement} combobox
 * @param {!(Array.<string>|Array.<object>)} names
 */
function initializeComboBox(combobox, names) {
  while (combobox.lastChild) {
    combobox.removeChild(combobox.lastChild)
  }

  for (const entry of names) {
    let label = ''
    let value = ''
    if (typeof entry === 'string') {
      label = entry
      value = getNormalizedName(entry)
    } else {
      label = entry.label
      value = entry.sample
    }
    const option = document.createElement('option')
    combobox.add(option)
    option.textContent = label
    if (entry === comboBoxSeparatorItem) {
      option.disabled = true
    } else {
      option.value = value
    }
  }
}

/**
 * Actually applies the layout.
 * @param {boolean} clearUndo Specifies whether the undo queue should be cleared after the layout
 * calculation. This is set to `true` if this method is called directly after
 * loading a new sample graph.
 * @returns {!Promise}
 */
async function applyLayout(clearUndo) {
  const config = optionEditor.config

  if (!config || !configOptionsValid || inLayout) {
    return
  }

  // prevent starting another layout calculation
  inLayout = true
  setUIDisabled(true)

  await config.apply(graphComponent, () => {
    releaseLocks()
    setUIDisabled(false)
    updateUIState()
    if (clearUndo) {
      graphComponent.graph.undoEngine.clear()
    }
  })
}

/**
 * @returns {!string}
 */
function getSelectedAlgorithm() {
  return layoutComboBox.options[layoutComboBox.selectedIndex].value
}

/**
 * @param {!string} layoutName
 */
function updateThicknessButtonsState(layoutName) {
  const generateEdgeThicknessButton = document.querySelector(`#generate-edge-thickness-button`)
  const resetEdgeThicknessButton = document.querySelector(`#reset-edge-thickness-button`)
  const generateEdgeDirectionButton = document.querySelector(`#generate-edge-direction-button`)
  const resetEdgeDirectionButton = document.querySelector(`#reset-edge-direction-button`)
  if (layoutName === 'hierarchic') {
    // enable edge-thickness buttons only for Hierarchic Layout
    generateEdgeThicknessButton.disabled = false
    resetEdgeThicknessButton.disabled = false
    generateEdgeDirectionButton.disabled = false
    resetEdgeDirectionButton.disabled = false
  } else {
    // disable edge-thickness buttons for all other layouts
    generateEdgeThicknessButton.disabled = true
    resetEdgeThicknessButton.disabled = true
    generateEdgeDirectionButton.disabled = true
    resetEdgeDirectionButton.disabled = true
    if (!customGraphSelected) {
      onResetEdgeThicknesses(graphComponent.graph)
      onResetEdgeDirections(graphComponent.graph)
    }
  }
}

/**
 * Handles a selection change in the layout combo box.
 * @param {boolean} [initSamples=true]
 * @param {!''} appliedPresetId
 * @returns {!Promise}
 */
async function onLayoutChanged(initSamples = true, appliedPresetId = '') {
  const layoutName = getSelectedAlgorithm()
  if (layoutName != null) {
    if (initSamples) {
      initializeSamples(layoutName)
    }

    // maybe enable thickness buttons
    updateThicknessButtonsState(layoutName)

    // use a new instance to re-initialize the default values
    const config = createLayoutConfig(layoutName)

    // place description in left sidebar
    updateDescriptionText(config)

    // this demo starts with collapsed option settings by default
    config.collapsedInitialization = true

    optionEditor.config = config
    optionEditor.validateConfigCallback = (b) => {
      configOptionsValid = b
      layoutButton.disabled = !(configOptionsValid && !inLayout)
    }

    let presetsStruct
    if (customGraphSelected) {
      presetsStruct = findPresets(layoutName)
      presetsStruct.defaultPreset = presetsStruct.presets[0]
    } else {
      const key = getSelectedSample()
      await onSampleChangedCore(key)
      presetsStruct = findPresets(layoutName, key)
    }

    presetsUiBuilder.buildUi(
      presetsStruct,
      appliedPresetId ? appliedPresetId : presetsStruct.defaultPreset
    )

    await applyLayout(!customGraphSelected)
  }
}

/**
 * @param {!LayoutConfigurationType} config
 */
function updateDescriptionText(config) {
  const layoutDescriptionContainer = document.querySelector(`#layout-description-container`)
  const layoutDescription = document.querySelector(`#layout-description`)
  const layoutTitle = document.querySelector(`#layout-title`)

  layoutDescriptionContainer.classList.remove('highlight-description')
  while (layoutDescription.lastChild) {
    layoutDescription.removeChild(layoutDescription.lastChild)
  }
  layoutTitle.innerHTML = ''

  if (config.descriptionText) {
    layoutDescription.innerHTML = config.descriptionText
    layoutTitle.innerHTML = config.title

    // highlight the description once
    setTimeout(() => {
      layoutDescriptionContainer.classList.add('highlight-description')
    }, 0)
  }
}

/**
 * @param {!string} algorithmName
 * @param {!''} sampleKey
 * @returns {!object}
 */
function findPresets(algorithmName, sampleKey = '') {
  const algorithm = findAlgorithmImpl(algorithmName)
  if (algorithm && algorithm.samples) {
    const presets = algorithm.presets ? algorithm.presets : []
    const invalidPresets = []
    const presetStruct = { presets, defaultPreset: '', invalidPresets }
    if (sampleKey !== '') {
      if (sampleKey !== 'modified-graph') {
        for (const entry of algorithm.samples) {
          if (entry.sample && getNormalizedName(entry.sample) === sampleKey) {
            if (entry.defaultPreset) {
              presetStruct.defaultPreset = entry.defaultPreset
            }
            if (entry.invalidPresets) {
              presetStruct.invalidPresets = [...entry.invalidPresets]
            }
          }
        }
      } else {
        //always select default preset for modified graph sample
        presetStruct.defaultPreset = presets[0]
      }
    }
    return presetStruct
  }
  return { presets: [], defaultPreset: '', invalidPresets: [] }
}

/**
 * @param {!string} algorithmName
 * @returns {?LayoutSample}
 */
function findAlgorithmImpl(algorithmName) {
  for (const entry of LayoutStyles) {
    if (!isSeparator(entry) && getNormalizedName(entry.layout) === algorithmName) {
      return entry
    }
  }
  return null
}

/**
 * Returns the value of the currently selected sample.
 * @returns {!string}
 */
function getSelectedSample() {
  return sampleComboBox.options[sampleComboBox.selectedIndex].value
}

/**
 * Returns the normalized version of the given name, i.e., in lowercase and '-' instead of space.
 * @param {!string} name
 * @returns {!string}
 */
function getNormalizedName(name) {
  return name.toLowerCase().replace(/\s/g, '-')
}

/**
 * Initializes the application configuration from the URL.
 * @returns {!Promise}
 */
async function initializeApplicationFromUrl() {
  const hash = window.location.hash
  if (hash) {
    await loadConfigurationFromLocationHash(hash)
  } else {
    await loadConfigurationFromUrl()
  }
}

/**
 * Updates current layout algorithm and current sample graph when the window location hash changes.
 * @returns {!Promise}
 */
async function onHashChanged() {
  const hash = window.location.hash
  if (hash) {
    await loadConfigurationFromLocationHash(hash)
  } else {
    await onLayoutChanged()
  }
}

/**
 * Checks whether the location hash specifies a valid sample, and loads that.
 * @param {!string} windowLocationHash
 * @returns {!Promise}
 */
async function loadConfigurationFromLocationHash(windowLocationHash) {
  const match = windowLocationHash.match(/#([\w_-]+)/)
  const hash = match && match.length > 1 ? match[1].toLowerCase().replace(/_/g, '-') : ''

  let layout = hash
  let sample = null
  let preset = null

  // support some specific hashed URLs by parsing specific sample configurations
  if (hash === 'hierarchic-with-subcomponents') {
    layout = 'hierarchic'
    sample = 'hierarchic-with-subcomponents'
    preset = 'hierarchic-with-subcomponents'
  } else if (hash === 'hierarchic-with-buses') {
    layout = 'hierarchic'
    sample = 'hierarchic-with-buses'
    preset = 'hierarchic-with-buses'
  } else if (hash === 'hierarchic-with-curves') {
    layout = 'hierarchic'
    sample = 'hierarchic'
    preset = 'hierarchic-with-curves'
  } else if (hash === 'organic-with-substructures') {
    layout = 'organic'
    sample = 'organic-with-substructures'
    preset = 'organic-with-substructures'
  } else if (hash === 'circular-with-substructures') {
    layout = 'circular'
    sample = 'circular-with-substructures'
    preset = 'circular-with-substructures'
  } else if (hash === 'orthogonal-with-substructures') {
    layout = 'orthogonal'
    sample = 'orthogonal-with-substructures'
    preset = 'orthogonal-with-substructures'
  } else if (hash === 'edge-router-with-buses') {
    layout = 'edge-router'
    sample = 'edge-router-with-buses'
    preset = 'edge-router-with-buses'
  } else if (hash === 'edge-router-with-curves') {
    layout = 'edge-router'
    sample = 'edge-router'
    preset = 'edge-router-with-curves'
  } else if (hash === 'grouping') {
    layout = 'hierarchic'
    sample = 'grouping'
  }

  await loadConfiguration(layout, sample, preset)
}

/**
 * Parses the URL parameters and loads the requested configuration.
 * @returns {!Promise}
 */
async function loadConfigurationFromUrl() {
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const requestedLayout = urlParams.get('layout')
    const requestedSample = urlParams.get('sample')
    const requestedPreset = urlParams.get('preset')
    await loadConfiguration(requestedLayout, requestedSample, requestedPreset)
  } catch (e) {
    /* URLSearchParams is not supported in IE, fallback to default algorithm and sample */
    onLayoutChanged()
  }
}

/**
 * Loads the requested layout, sample, and preset.
 * @param {?string} [layout=null]
 * @param {?string} [sample=null]
 * @param {?string} [preset=null]
 * @returns {!Promise}
 */
async function loadConfiguration(layout = null, sample = null, preset = null) {
  if (layout !== null) {
    // load the requested layout algorithm
    const layoutIndex = getIndexInComboBox(layoutComboBox, layout)
    if (layoutIndex === -1) {
      // maybe typo in hash which where it should just fail silently
      await onLayoutChanged()
      return
    }

    if (layoutIndex !== -1 && layoutComboBox.selectedIndex !== layoutIndex) {
      layoutComboBox.selectedIndex = layoutIndex
    }

    // always initialize the samples if the layout is given
    const layoutName = layoutComboBox.options[layoutIndex].value
    initializeSamples(layoutName)

    // load the requested sample
    if (sample !== null) {
      const sampleIndex = getIndexInComboBox(sampleComboBox, sample)
      if (sampleIndex !== -1 && sampleComboBox.selectedIndex !== sampleIndex) {
        sampleComboBox.selectedIndex = sampleIndex
      }
    }
  }

  // loads the requested layout alongside the selected sample
  await onLayoutChanged(layout === null, preset === null ? '' : preset)
}

/**
 * Copies the current graph into a temporary {@link IGraph} instance for later use.
 */
function storeModifiedGraph() {
  customGraph = new DefaultGraph()
  const copier = new GraphCopier()
  copier.copy(graphComponent.graph, customGraph)
}

/**
 * Loads the temporary stored modified graph into the main {@link GraphComponent}.
 */
function loadModifiedGraph() {
  if (customGraph !== null) {
    graphComponent.graph.clear()
    const copier = new GraphCopier()
    copier.copy(customGraph, graphComponent.graph)
  }
}

/**
 * Stores the current state as modified graph and adds a sample graph item for it.
 */
function updateModifiedGraphSample() {
  addCustomGraphEntry()
  storeModifiedGraph()
}

/**
 * Adjusts the style defaults to match the overall graph theme.
 * @param {!IGraph} graph
 */
function updateStyleDefaults(graph) {
  const firstNode = graph.nodes.find((n) => !graph.isGroupNode(n))
  const firstGroupNode = graph.nodes.find(
    (n) => graph.isGroupNode(n) && !(n.style instanceof TableNodeStyle)
  )
  const firstEdge = graph.edges.at(0)
  if (firstNode) {
    graph.nodeDefaults.style = firstNode.style.clone()
  } else {
    graph.nodeDefaults.style = createDemoNodeStyle()
  }
  if (firstGroupNode) {
    graph.groupNodeDefaults.style = firstGroupNode.style.clone()
  } else {
    graph.groupNodeDefaults.style = createDemoGroupStyle({
      foldingEnabled: graph.foldingView !== null
    })
  }
  if (firstEdge) {
    graph.edgeDefaults.style = firstEdge.style.clone()
  } else {
    graph.edgeDefaults.style = createDemoEdgeStyle()
  }
}

/**
 * Handles a selection change in the sample combo box.
 * @returns {!Promise}
 */
async function onSampleChanged() {
  if (inLayout || inLoadSample) {
    return
  }

  // load the sample
  const key = getSelectedSample()
  await onSampleChangedCore(key)

  const presetsStruct = findPresets(getSelectedAlgorithm(), key)
  presetsUiBuilder.buildUi(presetsStruct, presetsStruct.defaultPreset)

  await applyLayout(true)
}

/**
 * @param {?string} key
 * @returns {!Promise}
 */
async function onSampleChangedCore(key) {
  const graph = graphComponent.graph
  if (key == null || key === 'none') {
    // no specific item - just clear the graph
    graph.clear()
    // and fit the contents
    graphComponent.fitGraphBounds()
    return
  }
  inLoadSample = true
  setUIDisabled(true)

  if (customGraphSelected) {
    storeModifiedGraph()
  } else if (key === 'modified-graph') {
    loadModifiedGraph()
    applyLayout(true)
    customGraphSelected = true
    return
  }

  customGraphSelected = false

  const filePath = `resources/${key}.graphml`

  // load the sample graph and start the layout algorithm in the done handler
  const ioh = createConfiguredGraphMLIOHandler(graphComponent)
  await ioh.readFromURL(graph, filePath)

  // update style defaults based on the loaded sample
  updateStyleDefaults(graph)

  graphComponent.zoomTo(getCenter(graph), graphComponent.zoom)
}

/**
 * Generate and add random labels for a collection of ModelItems.
 * Existing items will be deleted before adding the new items.
 * @param {!IEnumerable.<ILabelOwner>} items the collection of items the labels are
 *   generated for
 */
function onGenerateItemLabels(items) {
  const wordCountMin = 1
  const wordCountMax = 3
  const labelPercMin = 0.2
  const labelPercMax = 0.7
  const labelCount = Math.floor(
    items.size * (Math.random() * (labelPercMax - labelPercMin) + labelPercMin)
  )

  const graph = graphComponent.graph

  const itemList = new List()
  for (const item of items) {
    itemList.add(item)
    removeLabels(graph, item)
  }

  // add random item labels
  const loremList = LoremIpsum
  for (let i = 0; i < labelCount; i++) {
    let label = ''
    const wordCount = Math.floor(Math.random() * (wordCountMax + 1 - wordCountMin)) + wordCountMin
    for (let j = 0; j < wordCount; j++) {
      const k = Math.floor(Math.random() * loremList.length)
      label += j === 0 ? '' : ' '
      label += loremList[k]
    }
    const itemIdx = Math.floor(Math.random() * itemList.size)
    const item = itemList.get(itemIdx)
    itemList.removeAt(itemIdx)
    graph.addLabel(item, label)
  }
}

/**
 * @param {!IGraph} graph
 */
function onRemoveItemLabels(graph) {
  for (const edge of graph.edges) {
    removeLabels(graph, edge)
  }
  for (const node of graph.nodes) {
    removeLabels(graph, node)
  }
}

/**
 * @param {!IGraph} graph
 */
function onGenerateEdgeThicknesses(graph) {
  for (const edge of graph.edges) {
    const thickness = Math.random() * 4 + 1
    const style = createDemoEdgeStyle()
    const oldStyle = edge.style
    if (oldStyle instanceof PolylineEdgeStyle) {
      adoptFromOldStyle(oldStyle, style, thickness)
    } else {
      style.stroke = createStroke(style.stroke, thickness)
    }
    graph.setStyle(edge, style)
  }
  graph.invalidateDisplays()
}

/**
 * @param {!IGraph} graph
 */
function onResetEdgeThicknesses(graph) {
  for (const edge of graph.edges) {
    const oldStyle = edge.style
    const style = createDemoEdgeStyle()
    if (oldStyle instanceof PolylineEdgeStyle) {
      adoptFromOldStyle(oldStyle, style, style.stroke.thickness)
    }
    graph.setStyle(edge, style)
  }
  graph.invalidateDisplays()
}

/**
 * @param {!IGraph} graph
 */
function onGenerateEdgeDirections(graph) {
  for (const edge of graph.edges) {
    const directed = Math.random() >= 0.5
    const style = createDemoEdgeStyle()
    const oldStyle = edge.style
    if (oldStyle instanceof PolylineEdgeStyle) {
      adoptFromOldStyle(oldStyle, style)
    }
    style.targetArrow = directed ? getDefaultArrow(graph) : IArrow.NONE
    graph.setStyle(edge, style)
  }
  graph.invalidateDisplays()
}

/**
 * @param {!IGraph} graph
 * @param {boolean} [directed=false]
 */
function onResetEdgeDirections(graph, directed = false) {
  for (const edge of graph.edges) {
    const oldStyle = edge.style
    const style = createDemoEdgeStyle()
    if (oldStyle instanceof PolylineEdgeStyle) {
      adoptFromOldStyle(oldStyle, style)
    }
    style.targetArrow = directed ? getDefaultArrow(graph) : IArrow.NONE
    graph.setStyle(edge, style)
  }
  graph.invalidateDisplays()
}

/**
 * @param {!PolylineEdgeStyle} oldStyle
 * @param {!PolylineEdgeStyle} style
 * @param {number} [thickness]
 */
function adoptFromOldStyle(oldStyle, style, thickness) {
  const oldStroke = oldStyle.stroke
  if (oldStroke !== null) {
    style.stroke = createStroke(oldStroke, thickness ?? oldStroke.thickness)
  }
  style.sourceArrow = oldStyle.sourceArrow
  style.targetArrow = oldStyle.targetArrow
  style.smoothingLength = oldStyle.smoothingLength
}

/**
 * @param {!Stroke} prototype
 * @param {number} thickness
 * @returns {!Stroke}
 */
function createStroke(prototype, thickness) {
  return new Stroke({
    fill: prototype.fill,
    thickness: thickness,
    lineCap: prototype.lineCap,
    lineJoin: prototype.lineJoin,
    dashStyle: prototype.dashStyle
  }).freeze()
}

/**
 * @param {!IGraph} graph
 * @returns {!IArrow}
 */
function getDefaultArrow(graph) {
  const defaultStyleArrow = graph.edgeDefaults.style.targetArrow
  return defaultStyleArrow !== IArrow.NONE ? defaultStyleArrow : createDemoEdgeStyle().targetArrow
}

/**
 * Initializes the graph instance and set default styles.
 */
function initializeGraph() {
  const graph = graphComponent.graph

  // enable grouping and undo support
  graph.undoEngineEnabled = true

  // set some nice defaults
  initDemoStyles(graph)

  // use a smart label model to support integrated labeling
  const model = new SmartEdgeLabelModel({ autoRotation: false })
  graph.edgeDefaults.labels.layoutParameter = model.createDefaultParameter()

  registerGraphEditListeners()
}

/**
 * Store a custom graph entry in the samples, if users modify the graph interactively.
 * The demo only tracks structural changes to the graph.
 */
function registerGraphEditListeners() {
  const geim = graphComponent.inputMode
  geim.addNodeCreatedListener(onGraphEdited)
  geim.addNodeReparentedListener(onGraphEdited)
  geim.addDeletedItemListener(onGraphEdited)
  geim.addLabelAddedListener(onGraphEdited)
  geim.addLabelTextChangedListener(onGraphEdited)
  geim.createEdgeInputMode.addEdgeCreatedListener(onGraphEdited)
}

/**
 * Listener called when graph is edited.
 */
function onGraphEdited() {
  addCustomGraphEntry()
  presetsUiBuilder.resetInvalidState()
}

/**
 * Adds a custom sample graph entry for a modified graph by the user.
 */
function addCustomGraphEntry() {
  customGraphSelected = true
  customGraph = customGraph || new DefaultGraph()
  let customGraphIdx = [...sampleComboBox.options].findIndex(
    (entry) => entry.value === 'modified-graph'
  )
  if (customGraphIdx === -1) {
    const option = document.createElement('option')
    sampleComboBox.add(option)
    option.textContent = 'Modified Graph'
    option.value = getNormalizedName(option.label)
    customGraphIdx = sampleComboBox.options.length - 1
  }
  sampleComboBox.selectedIndex = customGraphIdx
}

/**
 * Creates the default input mode for the {@link GraphComponent},
 * a {@link GraphEditorInputMode}.
 * @returns {!IInputMode} A new {@link GraphEditorInputMode} instance configured for snapping and
 *   orthogonal edge editing
 */
function createEditorMode() {
  const newGraphSnapContext = new GraphSnapContext({
    enabled: false,
    gridSnapType: GridSnapTypes.NONE
  })

  const newLabelSnapContext = new LabelSnapContext({
    enabled: false
  })

  // create default interaction with snapping and orthogonal edge editing
  const mode = new GraphEditorInputMode({
    allowGroupingOperations: true,
    snapContext: newGraphSnapContext,
    labelSnapContext: newLabelSnapContext,
    orthogonalEdgeEditingContext: new OrthogonalEdgeEditingContext({
      // initially disable the orthogonal edge editing
      enabled: false
    })
  })
  mode.navigationInputMode.allowCollapseGroup = false
  mode.navigationInputMode.allowExpandGroup = false

  // make bend creation more important than moving of selected edges
  // this has the effect that dragging a selected edge (not its bends)
  // will create a new bend instead of moving all bends
  // This is especially nicer in conjunction with orthogonal
  // edge editing because this creates additional bends every time
  // the edge is moved otherwise
  mode.createBendInputMode.priority = mode.moveInputMode.priority - 1

  // use WebGL rendering for handles if possible, otherwise the handles are rendered using SVG
  if (BrowserDetection.webGL2) {
    Class.ensure(WebGL2GraphModelManager)
    mode.handleInputMode.renderMode = RenderModes.WEB_GL2
  }

  // also we add a context menu
  initializeContextMenu(mode)

  return mode
}

/**
 * @param {!GraphInputMode} inputMode
 */
function initializeContextMenu(inputMode) {
  // Create a context menu. In this demo, we use our sample context menu implementation, but you can use any other
  // context menu widget as well. See the Context Menu demo for more details about working with context menus.
  const contextMenu = new ContextMenu(graphComponent)

  // Add event listeners to the various events that open the context menu. These listeners then
  // call the provided callback function which in turn asks the current ContextMenuInputMode if a
  // context menu should be shown at the current location.
  contextMenu.addOpeningEventListeners(graphComponent, (location) => {
    if (inputMode.contextMenuInputMode.shouldOpenMenu(graphComponent.toWorldFromPage(location))) {
      contextMenu.show(location)
    }
  })

  // Add an event listener that populates the context menu according to the hit elements, or cancels showing a menu.
  // This PopulateItemContextMenu is fired when calling the ContextMenuInputMode.shouldOpenMenu method above.
  inputMode.addPopulateItemContextMenuListener((_, evt) => populateContextMenu(contextMenu, evt))

  // Add a listener that closes the menu when the input mode requests this
  inputMode.contextMenuInputMode.addCloseMenuListener(() => {
    contextMenu.close()
  })

  // If the context menu closes itself, for example because a menu item was clicked, we must inform the input mode
  contextMenu.onClosedCallback = () => {
    inputMode.contextMenuInputMode.menuClosed()
  }
}

/**
 * Populates the context menu based on the item the mouse hovers over
 * @param {!ContextMenu} contextMenu
 * @param {!PopulateItemContextMenuEventArgs.<IModelItem>} args
 */
function populateContextMenu(contextMenu, args) {
  contextMenu.clearItems()

  // get the item which is located at the mouse position
  const hits = graphComponent.graphModelManager.hitTester.enumerateHits(
    args.context,
    args.queryLocation
  )

  // check whether a node was it. If it was, we prefer it over edges
  const hit = hits.find((item) => INode.isInstance(item)) || hits.at(0)

  if (!hit) {
    // empty canvas hit: provide 'select all'
    contextMenu.addMenuItem('Select All', () => {
      ICommand.SELECT_ALL.execute(null, graphComponent)
    })
  }

  const graphSelection = graphComponent.selection

  // if a node or an edge is hit: provide 'Select All Nodes' or 'Select All Edges', respectively
  // also: select the hit item
  if (INode.isInstance(hit)) {
    contextMenu.addMenuItem('Select All Nodes', () => {
      graphComponent.selection.clear()
      graphComponent.graph.nodes.forEach((node) => {
        graphComponent.selection.setSelected(node, true)
      })
    })
    if (!graphSelection.isSelected(hit)) {
      graphSelection.clear()
    }
    graphSelection.setSelected(hit, true)
  } else if (IEdge.isInstance(hit)) {
    contextMenu.addMenuItem('Select All Edges', () => {
      graphComponent.selection.clear()
      graphComponent.graph.edges.forEach((edge) => {
        graphComponent.selection.setSelected(edge, true)
      })
    })
    if (!graphSelection.isSelected(hit)) {
      graphSelection.clear()
    }
    graphSelection.setSelected(hit, true)
  }
  // if one or more nodes are selected: add options to cut and copy
  if (graphSelection.selectedNodes.size > 0) {
    contextMenu.addMenuItem('Cut', () => {
      ICommand.CUT.execute(null, graphComponent)
    })
    contextMenu.addMenuItem('Copy', () => {
      ICommand.COPY.execute(null, graphComponent)
    })
  }
  if (!graphComponent.clipboard.empty) {
    // clipboard is not empty: add option to paste
    contextMenu.addMenuItem('Paste', () => {
      ICommand.PASTE.execute(args.queryLocation, graphComponent)
    })
  }

  // finally, if the context menu has at least one entry, set the showMenu flag
  if (contextMenu.element.childNodes.length > 0) {
    args.showMenu = true
  }
}

/**
 * Wire up the UI...
 */
function initializeUI() {
  bindYFilesCommand(
    "button[data-command='OpenInSidebar']",
    ICommand.OPEN,
    graphComponent,
    null,
    'Open a GraphML file'
  )

  document.querySelector('#snapping-button').addEventListener('click', () => {
    const snappingEnabled = querySelector('#snapping-button').checked
    const geim = graphComponent.inputMode
    geim.snapContext.enabled = snappingEnabled
    geim.labelSnapContext.enabled = snappingEnabled
  })

  document.querySelector('#orthogonal-editing-button').addEventListener('click', () => {
    const geim = graphComponent.inputMode
    geim.orthogonalEdgeEditingContext.enabled = querySelector('#orthogonal-editing-button').checked
  })

  document.querySelector('#apply-layout-button').addEventListener('click', () => {
    applyLayout(false)
  })

  document.querySelector('#layout-select-box').addEventListener('change', async () => {
    await onLayoutChanged()
    layoutComboBox.focus()
  })

  document.querySelector('#sample-select-box').addEventListener('change', async () => {
    await onSampleChanged()
    sampleComboBox.focus()
  })

  // document.querySelector(selector)!.addEventListener('click', action)

  document.querySelector('#generate-node-labels').addEventListener('click', () => {
    onGenerateItemLabels(graphComponent.graph.nodes)
    updateModifiedGraphSample()
  })

  document.querySelector('#generate-edge-labels').addEventListener('click', () => {
    onGenerateItemLabels(graphComponent.graph.edges)
    updateModifiedGraphSample()
  })

  document.querySelector('#remove-labels').addEventListener('click', () => {
    onRemoveItemLabels(graphComponent.graph)
    updateModifiedGraphSample()
  })

  document.querySelector('#generate-edge-thickness-button').addEventListener('click', () => {
    onGenerateEdgeThicknesses(graphComponent.graph)
  })

  document.querySelector('#reset-edge-thickness-button').addEventListener('click', () => {
    onResetEdgeThicknesses(graphComponent.graph)
  })

  document.querySelector('#generate-edge-direction-button').addEventListener('click', () => {
    onGenerateEdgeDirections(graphComponent.graph)
  })

  document.querySelector('#reset-edge-direction-button').addEventListener('click', () => {
    onResetEdgeDirections(graphComponent.graph, true)
  })

  window.addEventListener('hashchange', () => {
    onHashChanged()
  })

  // apply layout shortcut with CTRL+Enter
  window.addEventListener('keydown', (e) => {
    const geim = graphComponent.inputMode
    if (!geim.textEditorInputMode.editing && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      applyLayout(false)
      e.preventDefault()
    }
  })
  // also allow 'enter' within the option-editor
  document.querySelector(`#data-editor`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      applyLayout(false)
      e.preventDefault()
    }
  })
}

function releaseLocks() {
  inLoadSample = false
  inLayout = false
}

/**
 * Enables the HTML elements and the input mode.
 * @param {boolean} disabled true if the elements should be disabled, false otherwise
 */
function setUIDisabled(disabled) {
  querySelector("button[data-command='NEW']").disabled = disabled
  querySelector("button[data-command='OPEN']").disabled = disabled
  querySelector("button[data-command='SAVE']").disabled = disabled
  sampleComboBox.disabled = disabled
  layoutComboBox.disabled = disabled
  layoutButton.disabled = disabled
  graphComponent.inputMode.waiting = disabled
  presetsUiBuilder.setPresetButtonDisabled(disabled)
}

function updateUIState() {
  sampleComboBox.disabled = false
  layoutComboBox.disabled = false
  layoutButton.disabled = !(configOptionsValid && !inLayout)
  presetsUiBuilder.setPresetButtonDisabled(false)
}

/**
 * @param {!IGraph} graph
 * @param {!ILabelOwner} item
 */
function removeLabels(graph, item) {
  const labels = new List()
  for (const label of item.labels) {
    labels.add(label)
  }
  for (const label of labels) {
    graph.remove(label)
  }
}

/**
 * Calculates the center of the accumulated bounds of the given graph's nodes.
 * @param {!IGraph} graph
 * @returns {!Point}
 */
function getCenter(graph) {
  if (graph.nodes.size > 0) {
    let bounds = graph.nodes.first().layout.toRect()
    for (const node of graph.nodes) {
      bounds = Rect.add(bounds, node.layout.toRect())
    }
    return bounds.center
  } else {
    return Point.ORIGIN
  }
}

/**
 * @template {HTMLElement} T
 * @param {!string} selector
 * @returns {!T}
 */
function querySelector(selector) {
  return document.querySelector(selector)
}

run().then(finishLoading)
