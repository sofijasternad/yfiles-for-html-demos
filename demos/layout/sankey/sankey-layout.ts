/****************************************************************************
 ** @license
 ** This demo file is part of yFiles for HTML 2.6.
 ** Copyright (c) 2000-2024 by yWorks GmbH, Vor dem Kreuzberg 28,
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
  type Edge,
  GenericLabeling,
  type GraphComponent,
  HierarchicLayout,
  HierarchicLayoutData,
  type IEdge,
  type IEnumerable,
  type IGraph,
  type ILayoutAlgorithm,
  type IModelItem,
  INode,
  LabelPlacements,
  type LayoutGraph,
  LayoutMode,
  LayoutOrientation,
  LayoutStageBase,
  PortConstraint,
  PortSide,
  PreferredPlacementDescriptor,
  type SimplexNodePlacer,
  type YNode
} from 'yfiles'
import { getVoterShift } from './data-types'
import { normalizeThickness } from './edge-thickness'
import { updateStyles } from './styles-support'

/**
 * Normalizes the edge thicknesses, updates the node and edge styles and the node sizes accordingly,
 * and runs a new layout.
 */
export async function updateStylesAndLayout(
  graphComponent: GraphComponent,
  fromSketchMode: boolean
): Promise<void> {
  // creates a compound edit so that the thickness normalization, the style changes and the layout
  // are all included in the same undo unit so that they can be reverted at one undo/redo step
  const compoundEdit = graphComponent.graph.beginEdit('Graph updated', 'Graph updated')
  normalizeThickness(graphComponent)
  updateStyles(graphComponent.graph)
  await runLayout(graphComponent, fromSketchMode)
  compoundEdit.commit()
}

/**
 * Runs the hierarchic layout to create the sankey diagram.
 * @param graphComponent The given graphComponent
 * @param fromSketchMode True if the layout should run in incremental mode, false otherwise
 */
export async function runLayout(
  graphComponent: GraphComponent,
  fromSketchMode: boolean
): Promise<void> {
  // configure the layout algorithm
  const layout = createHierarchicLayout(fromSketchMode)
  const layoutData = createHierarchicLayoutData(graphComponent.graph, fromSketchMode)

  // run the layout and animate the result
  await graphComponent.morphLayout(layout, '0.5s', layoutData)
}

/**
 * Configures the hierarchic layout algorithm for the Sankey visualization.
 * @param fromSketchMode True if the layout should run n incremental mode, false otherwise
 */
function createHierarchicLayout(fromSketchMode: boolean): HierarchicLayout {
  const hierarchicLayout = new HierarchicLayout({
    layoutOrientation: LayoutOrientation.LEFT_TO_RIGHT,
    layoutMode: fromSketchMode ? LayoutMode.INCREMENTAL : LayoutMode.FROM_SCRATCH,
    nodeToNodeDistance: 30,
    backLoopRouting: true
  })
  hierarchicLayout.edgeLayoutDescriptor.minimumFirstSegmentLength = 80
  hierarchicLayout.edgeLayoutDescriptor.minimumLastSegmentLength = 80
  // disable further reducing from bends
  ;(hierarchicLayout.nodePlacer as SimplexNodePlacer).bendReduction = false

  // a port border gap ratio of zero means that ports can be placed directly
  // on the corners of the nodes
  const portBorderRatio = 1
  hierarchicLayout.nodeLayoutDescriptor.portBorderGapRatios = portBorderRatio
  // configure the generic labeling algorithm which produces more compact results
  hierarchicLayout.labeling = new GenericLabeling({
    reduceAmbiguity: false,
    placeNodeLabels: false,
    placeEdgeLabels: true,
    deterministic: true
  })
  hierarchicLayout.labelingEnabled = true

  // for Sankey diagrams, the nodes should be adjusted to the
  // incoming/outgoing flow (enlarged if necessary) -> use NodeResizingStage for that purpose
  const nodeResizingStage = new NodeResizingStage(hierarchicLayout)
  nodeResizingStage.layoutOrientation = hierarchicLayout.layoutOrientation
  nodeResizingStage.portBorderGapRatio = portBorderRatio
  hierarchicLayout.prependStage(nodeResizingStage)

  return hierarchicLayout
}

/**
 * Configures the hierarchic layout data for the Sankey visualization
 * @returns The configured hierarchic Layout data object
 */
function createHierarchicLayoutData(graph: IGraph, fromSketchMode: boolean): HierarchicLayoutData {
  // create the layout data
  const hierarchicLayoutData = new HierarchicLayoutData({
    // maps each edge with its thickness so that the layout algorithm takes the edge
    // thickness under consideration
    edgeThickness: (edge: IEdge): number => getVoterShift(edge).thickness ?? 1,
    // since orientation is LEFT_TO_RIGHT, we add port constraints so that the edges
    // leave the source node at its right side and enter the target node at its left side
    sourcePortConstraints: (): PortConstraint => PortConstraint.create(PortSide.EAST, false)!,
    targetPortConstraints: (): PortConstraint => PortConstraint.create(PortSide.WEST, false)!,
    // edge labels should be placed near the source node, if possible
    edgeLabelPreferredPlacement: new PreferredPlacementDescriptor({
      placeAlongEdge: LabelPlacements.AT_SOURCE
    })
  })
  if (!fromSketchMode) {
    // In this demo, the nodes are ordered in the layers based on their size to show how the party
    // strength gets modified along the elections.
    // From this ordering the non-voters are excluded and are placed at the bottom of the layer
    hierarchicLayoutData.sequenceConstraints.itemComparables = (item: IModelItem): number =>
      item instanceof INode && !isNonVoter(item)
        ? graph
            .edgesAt(item)
            .reduce((acc: number, edge: IEdge) => acc + getVoterShift(edge).thickness!, 0)
        : 0
  }
  return hierarchicLayoutData
}

/**
 * This layout stage ensures that the size of the nodes is large enough such that
 * all edges can be placed without overlaps.
 */
class NodeResizingStage extends LayoutStageBase {
  #layoutOrientation: LayoutOrientation
  #portBorderGapRatio: number
  #minimumPortDistance: number

  /**
   * Creates a new instance of NodeResizingStage.
   */
  constructor(private readonly layout: ILayoutAlgorithm) {
    super(layout)
    this.#layoutOrientation = LayoutOrientation.LEFT_TO_RIGHT
    this.#portBorderGapRatio = 0
    this.#minimumPortDistance = 0
  }

  /**
   * Gets the main orientation of the layout. Should be the same value as for the associated core layout
   * algorithm.
   * @returns The main orientation of the layout
   */
  get layoutOrientation(): LayoutOrientation {
    return this.#layoutOrientation
  }

  /**
   * Gets the main orientation of the layout. Should be the same value as for the associated core layout
   * algorithm.
   * @param orientation One of the default layout orientations
   */
  set layoutOrientation(orientation: LayoutOrientation) {
    this.#layoutOrientation = orientation
  }

  /**
   * Gets the port border gap ratio for the port distribution at the sides of the nodes.
   * Should be the same value as for the associated core layout algorithm.
   * @returns The port border gap ratio
   */
  get portBorderGapRatio(): number {
    return this.#portBorderGapRatio
  }

  /**
   * Sets the port border gap ratio for the port distribution at the sides of the nodes. Should be the same value
   * as for the associated core layout algorithm.
   * @param portBorderGapRatio The given ratio
   */
  set portBorderGapRatio(portBorderGapRatio: number) {
    this.#portBorderGapRatio = portBorderGapRatio
  }

  /**
   * Returns the minimum distance between two ports on the same node side.
   * @returns The minimum distance between two ports
   */
  get minimumPortDistance(): number {
    return this.#minimumPortDistance
  }

  /**
   * Gets the minimum distance between two ports on the same node side.
   * @param minimumPortDistance The minimum distance
   */
  set minimumPortDistance(minimumPortDistance: number) {
    this.#minimumPortDistance = minimumPortDistance
  }

  /**
   * Applies the layout to the given graph.
   * @param graph The given graph
   */
  applyLayout(graph: LayoutGraph): void {
    graph.nodes.forEach((node: YNode): void => {
      this.adjustNodeSize(node, graph)
    })

    // run the core layout
    this.applyLayoutCore(graph)
  }

  /**
   * Adjusts the size of the given node.
   * @param node The given node
   * @param graph The given graph
   */
  adjustNodeSize(node: YNode, graph: LayoutGraph): void {
    let width = 60
    let height = 40

    const leftEdgeSpace = node.inEdges.size > 0 ? this.calcRequiredSpace(node.inEdges, graph) : 0
    const rightEdgeSpace = node.outEdges.size > 0 ? this.calcRequiredSpace(node.outEdges, graph) : 0
    if (
      this.layoutOrientation === LayoutOrientation.TOP_TO_BOTTOM ||
      this.layoutOrientation === LayoutOrientation.BOTTOM_TO_TOP
    ) {
      // we have to enlarge the width such that the in-/out-edges can be placed side by side without overlaps
      width = Math.max(width, leftEdgeSpace)
      width = Math.max(width, rightEdgeSpace)
    } else {
      // we have to enlarge the height such that the in-/out-edges can be placed side by side without overlaps
      height = Math.max(height, leftEdgeSpace)
      height = Math.max(height, rightEdgeSpace)
    }

    // adjust size for edges with strong port constraints
    const edgeThicknessDP = graph.getDataProvider(HierarchicLayout.EDGE_THICKNESS_DP_KEY)
    if (edgeThicknessDP !== null) {
      node.edges.forEach((edge: Edge): void => {
        const thickness = edgeThicknessDP.getNumber(edge)

        const spc = PortConstraint.getSPC(graph, edge)
        if (edge.source === node && spc !== null && spc.strong) {
          const sourcePoint = graph.getSourcePointRel(edge)
          width = Math.max(width, Math.abs(sourcePoint.x) * 2 + thickness)
          height = Math.max(height, Math.abs(sourcePoint.y) * 2 + thickness)
        }

        const tpc = PortConstraint.getTPC(graph, edge)
        if (edge.target === node && tpc !== null && tpc.strong) {
          const targetPoint = graph.getTargetPointRel(edge)
          width = Math.max(width, Math.abs(targetPoint.x) * 2 + thickness)
          height = Math.max(height, Math.abs(targetPoint.y) * 2 + thickness)
        }
      })
    }
    graph.setSize(node, width, height)
  }

  /**
   * Calculates the space required when placing the given edge side by side without overlaps and considering
   * the specified minimum port distance and edge thickness.
   * @param edges The edges to calculate the space for
   * @param graph The given graph
   */
  calcRequiredSpace(edges: IEnumerable<Edge>, graph: LayoutGraph): number {
    const edgeThicknessDP = graph.getDataProvider(HierarchicLayout.EDGE_THICKNESS_DP_KEY)
    return (
      edges.reduce((acc, edge) => {
        return acc + (edgeThicknessDP === null ? 0 : edgeThicknessDP.getNumber(edge))
      }, 0) +
      (edges.size - 1) * this.minimumPortDistance +
      2 * this.portBorderGapRatio * this.minimumPortDistance
    )
  }
}

/**
 * Returns whether the given node represents a non-voter.
 */
function isNonVoter(item: INode): boolean {
  return item.labels.size > 0 && item.labels.at(0)!.text === 'Non-voter'
}
