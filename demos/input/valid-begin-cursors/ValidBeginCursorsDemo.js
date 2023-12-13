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
  BaseClass,
  Class,
  Cursor,
  EventRecognizers,
  GraphBuilder,
  GraphComponent,
  GraphEditorInputMode,
  HierarchicLayout,
  IEdge,
  IGraph,
  IHitTestable,
  IInputModeContext,
  KeyEventRecognizers,
  LayoutExecutor,
  License,
  ModifierKeys,
  Point
} from 'yfiles'

import { applyDemoTheme, initDemoStyles } from 'demo-resources/demo-styles'
import { fetchLicense } from 'demo-resources/fetch-license'
import { finishLoading } from 'demo-resources/demo-page'
import graphData from './graph-data.json'

/** @type {GraphComponent} */
let graphComponent
const lassoCursor = new Cursor('resources/lasso.cur', Cursor.CROSSHAIR)
const createEdgeCursor = new Cursor('resources/createedge.cur', Cursor.DEFAULT)

/**
 * Runs the demo.
 * @returns {!Promise}
 */
async function run() {
  License.value = await fetchLicense()

  // Initialize the GraphComponent
  graphComponent = new GraphComponent('graphComponent')
  applyDemoTheme(graphComponent)

  // Assign the default demo styles
  initDemoStyles(graphComponent.graph)

  // build the graph from the given data set
  buildGraph(graphComponent.graph, graphData)

  // layout and center the graph
  Class.ensure(LayoutExecutor)
  graphComponent.graph.applyLayout(new HierarchicLayout({ minimumLayerDistance: 35 }))
  graphComponent.fitGraphBounds()

  // enable undo after the initial graph was populated since we don't want to allow undoing that
  graphComponent.graph.undoEngineEnabled = true

  // specify an input mode configured to use customized cursors and interaction gestures
  graphComponent.inputMode = createEditorMode()
}

/**
 * Creates nodes and edges according to the given data.
 * @param {!IGraph} graph
 * @param {!JSONGraph} graphData
 */
function buildGraph(graph, graphData) {
  const graphBuilder = new GraphBuilder(graph)

  graphBuilder.createNodesSource({
    data: graphData.nodeList.filter((item) => !item.isGroup),
    id: (item) => item.id,
    parentId: (item) => item.parentId
  })

  graphBuilder
    .createGroupNodesSource({
      data: graphData.nodeList.filter((item) => item.isGroup),
      id: (item) => item.id
    })
    .nodeCreator.createLabelBinding((item) => item.label)

  graphBuilder.createEdgesSource({
    data: graphData.edgeList,
    sourceId: (item) => item.source,
    targetId: (item) => item.target
  })

  graphBuilder.buildGraph()
}

/**
 * Creates and configures the editor input mode for this demo.
 * @returns {!GraphEditorInputMode}
 */
function createEditorMode() {
  const mode = new GraphEditorInputMode()

  // Lasso selection is disabled per default and has to be enabled first.
  mode.lassoSelectionInputMode.enabled = true
  // 'Shift' has to be pressed to start lasso selection which is indicated by a lasso cursor.
  mode.lassoSelectionInputMode.validBeginRecognizer = KeyEventRecognizers.SHIFT_IS_DOWN
  mode.lassoSelectionInputMode.validBeginCursor = lassoCursor
  mode.lassoSelectionInputMode.lassoCursor = lassoCursor
  // A finish radius is set and the cross-hair cursor is used to indicate that the gesture may end there.
  mode.lassoSelectionInputMode.validEndCursor = Cursor.CROSSHAIR
  mode.lassoSelectionInputMode.finishRadius = 10

  // Marquee selection should not start when 'Shift' is pressed.
  // Due to its relatively higher priority it also won't start when 'Ctrl' is pressed as in this
  // case the MoveViewportInputMode kicks in.
  mode.marqueeSelectionInputMode.validBeginRecognizer = EventRecognizers.inverse(
    KeyEventRecognizers.SHIFT_IS_DOWN
  )
  mode.marqueeSelectionInputMode.validBeginCursor = Cursor.CROSSHAIR
  mode.marqueeSelectionInputMode.marqueeCursor = Cursor.CROSSHAIR

  // 'Ctrl' has to be pressed to start moving the viewport which is indicated by a grab cursor
  mode.moveViewportInputMode.validBeginRecognizer = KeyEventRecognizers.CTRL_IS_DOWN
  mode.moveViewportInputMode.validBeginCursor = Cursor.GRAB
  mode.moveViewportInputMode.dragCursor = Cursor.GRABBING

  // Only hovering over an edge is a valid tool tip location and is indicated by the help cursor
  mode.mouseHoverInputMode.validHoverLocationHitTestable = new EdgeHitTestable()
  mode.mouseHoverInputMode.validHoverLocationCursor = Cursor.HELP
  // The hover input mode should have a lower priority then the MoveViewportInputMode so its cursor
  // is displayed when hovering over an edge.
  mode.mouseHoverInputMode.priority = mode.moveViewportInputMode.priority - 3
  // For edges a simple tooltip containing information about the source and target node is used.
  mode.addQueryItemToolTipListener((_, evt) => {
    if (evt.item instanceof IEdge && !evt.handled) {
      evt.toolTip = `${evt.item.sourceNode} -> ${evt.item.targetNode}`
      evt.handled = true
    }
  })

  // Edge creation shall only start when 'Ctrl' is pressed and the mouse is hovering over an unselected node.
  // The check for hovering  over an unselected node is already done by the default beginHitTestable,
  // so we only have to combine this with a check, whether the 'Ctrl' key was pressed in the last input event.
  const defaultBeginHitTestable = mode.createEdgeInputMode.beginHitTestable
  mode.createEdgeInputMode.beginHitTestable = IHitTestable.create(
    (context, location) =>
      defaultBeginHitTestable.isHit(context, location) &&
      (graphComponent.lastInputEvent.modifiers & ModifierKeys.CONTROL) === ModifierKeys.CONTROL
  )
  // Use a custom create-edge cursor to indicate that edge creation is valid to begin and while
  // still dragging over the source node.
  mode.createEdgeInputMode.validBeginCursor = createEdgeCursor
  mode.createEdgeInputMode.sourceNodeDraggingCursor = createEdgeCursor
  // disable enforced bend creation, so we can end edge creation with 'Ctrl' held down
  mode.createEdgeInputMode.enforceBendCreationRecognizer = EventRecognizers.NEVER
  // As both CreateEdgeInputMode and MoveViewportInputMode now use the 'Ctrl' modifier, we have
  // to assign the CreateEdgeInputMode a lower priority as otherwise MoveViewportInputMode would
  // always win.
  mode.createEdgeInputMode.priority = mode.moveViewportInputMode.priority - 2

  // Node should be movable whether selected or not, so we enabled the moveUnselectedInputMode
  mode.moveUnselectedInputMode.enabled = true
  mode.moveUnselectedInputMode.priority = mode.moveViewportInputMode.priority - 1
  return mode
}

/**
 * This hit testable returns true when any edge is at the given location.
 */
class EdgeHitTestable extends BaseClass(IHitTestable) {
  /**
   * @param {!IInputModeContext} _context
   * @param {!Point} location
   * @returns {boolean}
   */
  isHit(_context, location) {
    return graphComponent.graphModelManager.typedHitElementsAt(IEdge.$class, location).some()
  }
}

run().then(finishLoading)
