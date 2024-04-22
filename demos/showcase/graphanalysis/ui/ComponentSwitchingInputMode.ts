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
import './component-switching-input-mode.css'
import {
  BaseClass,
  type ConcurrencyController,
  type GraphComponent,
  GraphModelManager,
  IBoundsProvider,
  type ICanvasContext,
  type ICanvasObject,
  ICanvasObjectDescriptor,
  type ICanvasObjectGroup,
  IEdge,
  IHitTestable,
  type IInputModeContext,
  type IModelItem,
  INode,
  InputModeBase,
  type IRenderContext,
  IVisibilityTestable,
  IVisualCreator,
  MouseButtons,
  type MouseEventArgs,
  Point,
  type Rect,
  SvgVisual,
  type Visual
} from 'yfiles'
import { getColorForComponent } from '../styles'
import { getTag, type Tag } from '../demo-types'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * An input mode that shows an overlay and allows to switch between the displayed
 * components for nodes that belong to multiple components.
 * The input mode will also highlight all nodes and edges belonging to a component
 * being hovered over.
 */
export class ComponentSwitchingInputMode extends InputModeBase {
  /** The {@link GraphModelManager} that shows an overlay for potentially every node. */
  private modelManager?: GraphModelManager
  /** The canvas object group into which the overlays are rendered. */
  private canvasObjectGroup?: ICanvasObjectGroup
  /** The node currently hovered over, showing an extended popup for selecting the displayed component. */
  hoveredNode?: INode
  /** The canvas object for the popup on a hovered node */
  private popupCanvasObject?: ICanvasObject

  // Input event listeners; we need to bind them once, so we can remove them later again.
  private readonly mouseMovedHandler = this.onMouseMoved.bind(this)
  private readonly mouseLeftHandler = this.onMouseLeft.bind(this)
  private readonly mouseClickedHandler = this.onMouseClicked.bind(this)

  install(context: IInputModeContext, controller: ConcurrencyController): void {
    super.install(context, controller)
    const graphComponent = context.canvasComponent as GraphComponent

    // Add custom node overlays where multiple components are present
    this.canvasObjectGroup = context.canvasComponent!.rootGroup.addGroup()
    // Show them right above the graph and below the selection
    this.canvasObjectGroup.below(graphComponent.selectionGroup)
    // We use a GraphModelManager here, which automatically keeps one visualization
    // for each graph item around.
    this.modelManager = new GraphModelManager(null, this.canvasObjectGroup)
    // Apply custom rendering for nodes
    this.modelManager.nodeDescriptor = new ComponentOverlayDescriptor(this)
    // Disable all other graph items
    this.modelManager.edgeDescriptor =
      this.modelManager.portDescriptor =
      this.modelManager.edgeLabelDescriptor =
      this.modelManager.nodeLabelDescriptor =
      this.modelManager.portLabelDescriptor =
        ICanvasObjectDescriptor.VOID
    this.modelManager.install(graphComponent, graphComponent.graph)

    // Input event handling
    graphComponent.addMouseMoveListener(this.mouseMovedHandler)
    graphComponent.addMouseLeaveListener(this.mouseLeftHandler)
    graphComponent.addMouseClickListener(this.mouseClickedHandler)
  }

  uninstall(context: IInputModeContext): void {
    const graphComponent = context.canvasComponent as GraphComponent
    this.modelManager?.uninstall(graphComponent)
    this.canvasObjectGroup?.remove()
    this.canvasObjectGroup = undefined

    graphComponent.removeMouseMoveListener(this.mouseMovedHandler)
    graphComponent.removeMouseLeaveListener(this.mouseLeftHandler)
    graphComponent.removeMouseClickListener(this.mouseClickedHandler)

    super.uninstall(context)
  }

  /**
   * Event listener for mouse move events.
   * This performs a hit-test to see what item is under the mouse pointer
   * and then proceeds accordingly, depending on what has been hit.
   */
  private onMouseMoved(sender: GraphComponent, evt: MouseEventArgs): void {
    const hitTest = this.hitTest(this.createChildInputModeContext(), sender.lastEventLocation)
    switch (hitTest.result) {
      case 'nothing':
        this.highlightComponent(null)
        this.hideFlyout()
        this.inputModeContext?.invalidateDisplays()
        break
      case 'node':
        if (shouldShowOverlay(hitTest.item)) {
          this.showPopup(hitTest.item)
        }
        this.highlightComponent(getCurrentComponent(hitTest.item, evt.location))
        break
      case 'edge':
        this.highlightComponent(getCurrentComponent(hitTest.item, evt.location))
        this.hideFlyout()
        break
      case 'popup':
        this.highlightComponent(getCurrentComponent(hitTest.item, evt.location))
        break
    }
  }

  /**
   * Determines what item is at the given location.
   */
  private hitTest(context: IInputModeContext, location: Point): HitResult {
    if (context.canvasComponent) {
      for (const canvasObject of context.canvasComponent.hitElementsAt(context, location)) {
        const userObject = canvasObject.userObject as unknown
        if (userObject instanceof ComponentSelectionPopup) {
          return { result: 'popup', item: userObject }
        }
        if (userObject instanceof INode) {
          return { result: 'node', item: userObject }
        }
        if (userObject instanceof IEdge) {
          return { result: 'edge', item: userObject }
        }
      }
    }
    return { result: 'nothing' }
  }

  /**
   * Event listener when the mouse leaves the component.
   * Resets the popup and overlay state.
   */
  private onMouseLeft(): void {
    this.highlightComponent(null)
    this.hideFlyout()
    this.inputModeContext?.invalidateDisplays()
  }

  /**
   * Highlights all nodes and edges belonging to a particular component.
   */
  private highlightComponent(componentId: number | null): void {
    const graph = this.inputModeContext?.graph
    if (graph) {
      for (const node of graph.nodes) {
        this.updateHighlightedComponent(getTag(node), componentId)
      }
      for (const edge of graph.edges) {
        this.updateHighlightedComponent(getTag(edge), componentId)
      }
      this.inputModeContext?.invalidateDisplays()
    }
  }

  /**
   * Updates the tag for an item with a highlighted component or
   * removes the highlight, as needed.
   */
  private updateHighlightedComponent(tag: Tag, componentId: number | null): void {
    if (componentId !== null && tag.components.includes(componentId)) {
      tag.highlightedComponent = componentId
    } else {
      delete tag.highlightedComponent
    }
  }

  /**
   * Enlarges the multicolored component circle that then serves as a popup
   * to select the component to display.
   */
  private showPopup(node: INode): void {
    if (this.popupCanvasObject) {
      return
    }
    this.hoveredNode = node
    this.popupCanvasObject = this.canvasObjectGroup?.addChild(new ComponentSelectionPopup(node))
    this.popupCanvasObject?.toBack()
  }

  private hideFlyout(): void {
    this.hoveredNode = undefined
    this.popupCanvasObject?.remove()
    this.popupCanvasObject = undefined
  }

  /**
   * Event listener for mouse clicks.
   * Clicking on a component color in the popup makes that component display
   * in front of others.
   */
  private onMouseClicked(_sender: GraphComponent, evt: MouseEventArgs): void {
    if (evt.changedButtons === MouseButtons.LEFT && this.hoveredNode) {
      const hitTest = this.hitTest(this.createChildInputModeContext(), evt.location)
      if (hitTest.result === 'popup') {
        this.requestMutex()
        const component = getCurrentComponent(hitTest.item, evt.location)
        this.switchToComponent(component!)
        this.releaseMutex()
      }
    }
  }

  /**
   * Causes the given component to be rendered if it belongs to a node or edge.
   * This works by virtue of the first component in the tag being used for
   * the node and edge colors (cf. {@link TagColoredShapeNodeStyleRenderer}).
   */
  private switchToComponent(component: number): void {
    // Reorder the desired component to start of the components' list,
    // so it will be highlighted for all nodes where this is a shared component
    const graph = this.inputModeContext?.graph
    if (graph) {
      for (const node of graph.nodes) {
        sortToBeginning(component, getTag(node).components)
      }
      for (const edge of graph.edges) {
        sortToBeginning(component, getTag(edge).components)
      }
      this.inputModeContext?.invalidateDisplays()
    }
  }
}

/**
 * A custom descriptor implementation that renders a multicolored circle for nodes
 * that belong to multiple components.
 */
class ComponentOverlayDescriptor extends BaseClass(
  ICanvasObjectDescriptor,
  IVisibilityTestable,
  IVisualCreator
) {
  private node?: INode

  constructor(private readonly inputMode: ComponentSwitchingInputMode) {
    super()
  }

  createVisual(context: IRenderContext): Visual | null {
    // Some nodes may not have a tag, or components in the tag;
    // we don't have to do anything for them
    const node = this.node!
    if (!shouldShowOverlay(node)) {
      return null
    }

    const tag = getTag(node)
    const components = getSortedComponents(tag.components)

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.classList.add('components-overlay')
    this.updateCssClasses(g)

    const { x, y, width } = node.layout
    const radius = width * 0.5

    const ringGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    ringGroup.classList.add('components')
    if (tag.type) {
      ringGroup.classList.add(tag.type)
    }

    renderComponentSegments(components, ringGroup, radius - 2.5, radius, radius)

    g.append(ringGroup)

    // White circle to separate the outer ring from the node
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.cx.baseVal.value = circle.cy.baseVal.value = radius
    circle.r.baseVal.value = radius - 5
    circle.setAttribute('fill', 'none')
    circle.setAttribute('stroke', 'white')
    circle.setAttribute('stroke-width', '2')

    g.append(circle)

    // Move to the node's location
    SvgVisual.setTranslate(g, x, y)

    const visual: VisualWithCache = new SvgVisual(g)

    // Remember node size and components for updating later
    visual.size = width
    visual.components = new Set(components)
    return visual
  }

  updateVisual(context: IRenderContext, oldVisual: Visual | null): Visual | null {
    const node = this.node!
    const tag = getTag(node)
    const components = getSortedComponents(tag.components)
    if (components.length < 2) {
      return null
    }
    const { x, y, width } = node.layout

    const visual = oldVisual as VisualWithCache
    if (visual.size !== undefined && visual.components) {
      if (
        visual.size === width &&
        components.length === visual.components.size &&
        components.every((c) => visual.components!.has(c))
      ) {
        const g = visual.svgElement

        // Update location and CSS class
        SvgVisual.setTranslate(g, x, y)
        this.updateCssClasses(g)

        return visual
      }
    }
    return this.createVisual(context)
  }

  /**
   * Updates the CSS classes based on whether this node is currently hovered over
   * and whether the node is highlighted.
   */
  private updateCssClasses(element: SVGElement): void {
    if (this.inputMode.hoveredNode === this.node) {
      element.classList.add('hovered')
    } else {
      element.classList.remove('hovered')
    }
    const tag = getTag(this.node!)
    if (tag.highlightedComponent !== undefined) {
      element.classList.add('highlighted')
    } else {
      element.classList.remove('highlighted')
    }
  }

  isVisible(context: ICanvasContext, rectangle: Rect): boolean {
    const node = this.node
    if (!node) {
      return false
    }
    return rectangle.intersects(node.layout.toRect().getEnlarged(node.layout.width))
  }

  // ICanvasObjectDescriptor implementation - many parts are not needed at all

  getBoundsProvider(forUserObject: any): IBoundsProvider {
    return IBoundsProvider.EMPTY
  }

  getHitTestable(forUserObject: any): IHitTestable {
    return IHitTestable.NEVER
  }

  getVisibilityTestable(forUserObject: any): IVisibilityTestable {
    this.node = forUserObject as INode
    return this
  }

  getVisualCreator(forUserObject: any): IVisualCreator {
    this.node = forUserObject as INode
    return this
  }

  isDirty(context: ICanvasContext, canvasObject: ICanvasObject): boolean {
    return true
  }
}

/**
 * Determines whether to show the multicolored circle overlay for a given node.
 */
function shouldShowOverlay(node: INode): boolean {
  const tag = getTag(node)
  return !tag.type && tag.components.length > 1 && tag.gradient === undefined
}

/**
 * Returns a sorted list of components to keep the overlay stable.
 */
function getSortedComponents(components: number[]): number[] {
  return [...components].sort((a, b) => a - b)
}

/**
 * Renders a multicolored ring with the given radius for all components.
 */
function renderComponentSegments(
  components: number[],
  g: SVGGElement,
  radius: number,
  cx: number,
  cy: number
): void {
  const angle = (2 * Math.PI) / components.length
  const angleDeg = (angle * 180) / Math.PI
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  // Sort components to always get a consistent order of colors
  components = getSortedComponents(components)

  const d = `M ${cx} ${cy - radius} A${radius},${radius} 0 0,1 ${cx + sin * radius},${
    cy - cos * radius
  }`

  for (let i = 0; i < components.length; i++) {
    const slice = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    slice.setAttribute('d', d)

    const component = components[i]
    const color = getColorForComponent(component)!
    slice.setAttribute('stroke', color)
    slice.setAttribute('transform', `rotate(${i * angleDeg} ${cx} ${cy})`)

    g.append(slice)
  }
}

function getCurrentComponent(
  item: IModelItem | ComponentSelectionPopup,
  location: Point
): number | null {
  if (item instanceof ComponentSelectionPopup) {
    return getComponentFromPopup(item, location)
  } else {
    const tag = getTag(item)
    if (tag.components.length > 0) {
      return tag.components[0]
    }
  }
  return null
}

function getComponentFromPopup(popup: ComponentSelectionPopup, location: Point): number {
  const node = popup.node
  const tag = getTag(node)
  const center = node.layout.center
  const up = new Point(0, -1)
  const vector = location.subtract(center)

  let angle = Math.acos(up.scalarProduct(vector) / vector.vectorLength)
  if (location.x < center.x) {
    angle *= -1
  }

  // Normalize to 0-2pi
  angle += 2 * Math.PI
  angle %= 2 * Math.PI

  const components = getSortedComponents(tag.components)
  const sliceAngle = (2 * Math.PI) / components.length
  const index = Math.floor(angle / sliceAngle)
  return components[index]
}

/**
 * Sorts a given number to the beginning of the array.
 */
function sortToBeginning(component: number, components: number[]): void {
  if (components.length > 1) {
    const index = components.indexOf(component)
    if (index >= 0) {
      components.splice(index, 1)
      components.unshift(component)
    }
  }
}

/**
 * Helper hit-testing object added around a node, so that we can distinguish
 * hitting a node, this popup, or nothing with a yFiles {@link ICanvasObject}-based
 * hit-test.
 */
class ComponentSelectionPopup extends BaseClass(IHitTestable) {
  constructor(readonly node: INode) {
    super()
  }

  isHit(context: IInputModeContext, location: Point): boolean {
    const { center, width } = this.node.layout
    const distance = location.distanceTo(center)
    // Only consider the extended ring around the node
    return distance > width * 0.3 && distance < width * 1.2
  }
}

/**
 * The result of a hit-test within {@link ComponentSwitchingInputMode}
 * which can hit either a node, an edge, the component selection popup, or nothing.
 */
type HitResult =
  | { result: 'node'; item: INode }
  | { result: 'edge'; item: IEdge }
  | { result: 'popup'; item: ComponentSelectionPopup }
  | { result: 'nothing' }

type VisualWithCache = SvgVisual & {
  size?: number
  components?: Set<number>
}
