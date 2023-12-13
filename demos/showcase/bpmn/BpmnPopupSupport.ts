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
  Enum,
  ExteriorLabelModel,
  ExteriorLabelModelPosition,
  FreeNodeLabelModel,
  GraphComponent,
  GraphEditorInputMode,
  GraphItemTypes,
  HashMap,
  ICommand,
  IEdge,
  IEdgeStyle,
  IEnumerable,
  ILabel,
  ILabelModelParameter,
  ILabelOwner,
  IModelItem,
  INode,
  INodeStyle,
  IPort,
  IPortStyle,
  NinePositionsEdgeLabelModel,
  Point,
  Rect,
  SimpleLabel,
  SimpleNode,
  Size,
  YObject
} from 'yfiles'

import {
  ActivityNodeStyle,
  ActivityType,
  BpmnEdgeStyle,
  ChoreographyNodeStyle,
  ChoreographyType,
  ConversationNodeStyle,
  ConversationType,
  DataObjectNodeStyle,
  DataObjectType,
  EdgeType,
  EventCharacteristic,
  EventNodeStyle,
  EventPortStyle,
  EventType,
  GatewayNodeStyle,
  GatewayType,
  LoopCharacteristic,
  PoolNodeStyle,
  SubState,
  TaskType
} from './bpmn-view'
import type { ContextMenu } from 'demo-utils/ContextMenu'

class BpmnPopup {
  graphComponent: GraphComponent
  labelModelParameter: ILabelModelParameter
  divField: HTMLElement
  _currentItem: IModelItem | null = null
  dirty = false

  constructor(
    graphComponent: GraphComponent,
    div: HTMLElement,
    labelModelParameter: ILabelModelParameter
  ) {
    this.graphComponent = graphComponent
    this.labelModelParameter = labelModelParameter

    this.divField = div
    div.style.display = 'none'

    this.registerListeners()
  }

  /**
   * Returns the pop-up div.
   */
  get div(): Element {
    return this.divField
  }

  /**
   * Gets the {@link IModelItem item} to display information for.
   * Setting this property to a value other than null shows the pop-up.
   * Setting the property to null hides the pop-up.
   */
  get currentItem(): IModelItem | null {
    return this._currentItem
  }

  /**
   * Sets the {@link IModelItem item} to display information for.
   * Setting this property to a value other than null shows the pop-up.
   * Setting the property to null hides the pop-up.
   */
  set currentItem(value: IModelItem | null) {
    if (value === this._currentItem) {
      return
    }
    this._currentItem = value
    if (value != null) {
      this.show()
    } else {
      this.hide()
    }
  }

  registerListeners(): void {
    // Add listener for viewport changes
    this.graphComponent.addViewportChangedListener(() => {
      if (this._currentItem) {
        this.dirty = true
      }
    })

    // Add listeners for node bounds changes
    this.graphComponent.graph.addNodeLayoutChangedListener((_, node) => {
      if (
        (this._currentItem && this._currentItem === node) ||
        (this._currentItem instanceof IEdge &&
          (node === this._currentItem.sourcePort!.owner ||
            node === this._currentItem.targetPort!.owner))
      ) {
        this.dirty = true
      }
    })

    // Add listener for updates of the visual tree
    this.graphComponent.addUpdatedVisualListener(() => {
      if (this._currentItem && this.dirty) {
        this.dirty = false
        this.updateLocation()
      }
    })
  }

  /**
   * Makes this pop-up visible near the given item.
   */
  show(): void {
    this.divField.style.display = 'block'
    this.updateLocation()
  }

  /**
   * Hides this pop-up.
   */
  hide(): void {
    this.divField.style.display = 'none'
  }

  /**
   * Changes the location of this pop-up to the location calculated by the
   * {@link BpmnPopupSupport.labelModelParameter}. Currently, this implementation does not support rotated pop-ups.
   */
  updateLocation(): void {
    if (!this._currentItem && !this.labelModelParameter) {
      return
    }
    const width = this.divField.clientWidth
    const height = this.divField.clientHeight
    const zoom = this.graphComponent.zoom

    const dummyLabel = new SimpleLabel(
      null,
      '',
      FreeNodeLabelModel.INSTANCE.createDefaultParameter()
    )
    dummyLabel.preferredSize = new Size(width / zoom, height / zoom)

    if (this._currentItem instanceof ILabelOwner) {
      dummyLabel.owner = this._currentItem
    } else if (this._currentItem instanceof IPort) {
      const location = this._currentItem.location
      const newSimpleNode = new SimpleNode()
      newSimpleNode.layout = new Rect(location.x - 10, location.y - 10, 20, 20)
      dummyLabel.owner = newSimpleNode
    }
    if (this.labelModelParameter.supports(dummyLabel)) {
      dummyLabel.layoutParameter = this.labelModelParameter
      const layout = this.labelModelParameter.model.getGeometry(
        dummyLabel,
        this.labelModelParameter
      )
      this.setLocation(layout.anchorX, layout.anchorY - height / zoom)
    }
  }

  /**
   * Sets the location of this pop-up to the given world coordinates.
   * @param x The target x-coordinate of the pop-up.
   * @param y The target y-coordinate of the pop-up.
   */
  setLocation(x: number, y: number): void {
    // Calculate the view coordinates since we have to place the div in the regular HTML coordinate space
    const viewPoint = this.graphComponent.toViewCoordinates(new Point(x, y))
    this.divField.style.left = `${viewPoint.x}px`
    this.divField.style.top = `${viewPoint.y}px`
  }
}

/**
 * Manages visibility and content of popup.
 */
export default class BpmnPopupSupport {
  private gatewayTypeBox = document.querySelector<HTMLSelectElement>('#gateway-type-box')!
  private eventTypeBox = document.querySelector<HTMLSelectElement>('#event-type-box')!
  private eventCharacteristicBox = document.querySelector<HTMLSelectElement>(
    '#event-characteristic-box'
  )!
  private activityAdHocCheckBox = document.querySelector<HTMLInputElement>(
    '#activity-ad-hoc-checkbox'
  )!
  private activityCompensationCheckBox = document.querySelector<HTMLInputElement>(
    '#activity-compensation-checkbox'
  )!
  private activityTypeBox = document.querySelector<HTMLSelectElement>('#activity-type-box')!
  private activityLoopCharacteristicBox = document.querySelector<HTMLSelectElement>(
    '#activity-loop-characteristic-box'
  )!
  private activitySubStateBox =
    document.querySelector<HTMLSelectElement>('#activity-sub-state-box')!
  private activityTaskTypeBox =
    document.querySelector<HTMLSelectElement>('#activity-task-type-box')!
  private activityTriggerEventCharacteristicBox = document.querySelector<HTMLSelectElement>(
    '#activity-trigger-event-characteristic-box'
  )!
  private activityTriggerEventTypeBox = document.querySelector<HTMLSelectElement>(
    '#activity-trigger-event-type-box'
  )!
  private conversationTypeBox = document.querySelector<HTMLSelectElement>('#conversation-type-box')!
  private choreographyInitiatingAtTopCheckBox = document.querySelector<HTMLInputElement>(
    '#choreography-initiating-at-top-checkbox'
  )!
  private choreographyInitiatingMessageCheckBox = document.querySelector<HTMLInputElement>(
    '#choreography-initiating-message-checkbox'
  )!
  private choreographyResponseMessageCheckBox = document.querySelector<HTMLInputElement>(
    '#choreography-response-message-checkbox'
  )!
  private choreographyTypeBox = document.querySelector<HTMLSelectElement>('#choreography-type-box')!
  private choreographyLoopCharacteristicBox = document.querySelector<HTMLSelectElement>(
    '#choreography-loop-characteristic-box'
  )!
  private choreographySubStateBox = document.querySelector<HTMLSelectElement>(
    '#choreography-sub-state-box'
  )!
  private dataObjectCollectionCheckBox = document.querySelector<HTMLInputElement>(
    '#data-object-collection-checkbox'
  )!
  private dataObjectTypeBox = document.querySelector<HTMLSelectElement>('#data-object-type-box')!
  private poolMultipleCheckBox =
    document.querySelector<HTMLInputElement>('#pool-multiple-checkbox')!
  private edgeTypeBox = document.querySelector<HTMLSelectElement>('#edge-type-box')!
  private portEventTypeBox = document.querySelector<HTMLSelectElement>('#port-event-type-box')!
  private portEventCharacteristicBox = document.querySelector<HTMLSelectElement>(
    '#event-characteristic-box'
  )!

  graphComponent: GraphComponent
  contextMenu: ContextMenu
  // the currently visible popup.
  activePopup: BpmnPopup | null = null
  // a mapping of BPMN styles to popup-support to identify the right popup to show for an item.
  typePopups: HashMap<Class, BpmnPopup> = new HashMap()

  constructor(graphComponent: GraphComponent, contextMenu: ContextMenu) {
    this.graphComponent = graphComponent
    this.contextMenu = contextMenu

    this.initializePopups()
    this.initializePopupSynchronization()
  }

  /**
   * Initialize UI elements used in the popups.
   */
  initializePopups(): void {
    // fill combo boxes with enum types
    populateComboBox(this.activityTypeBox, ActivityType.$class)
    populateComboBox(this.gatewayTypeBox, GatewayType.$class)
    populateComboBox(this.eventTypeBox, EventType.$class)
    populateComboBox(this.eventCharacteristicBox, EventCharacteristic.$class)
    populateComboBox(this.activityLoopCharacteristicBox, LoopCharacteristic.$class)
    populateComboBox(this.activitySubStateBox, SubState.$class)
    populateComboBox(this.activityTaskTypeBox, TaskType.$class)
    populateComboBox(this.activityTriggerEventCharacteristicBox, EventCharacteristic.$class)
    populateComboBox(this.activityTriggerEventTypeBox, EventType.$class)
    populateComboBox(this.conversationTypeBox, ConversationType.$class)
    populateComboBox(this.choreographyTypeBox, ChoreographyType.$class)
    populateComboBox(this.choreographyLoopCharacteristicBox, LoopCharacteristic.$class)
    populateComboBox(this.choreographySubStateBox, SubState.$class)
    populateComboBox(this.dataObjectTypeBox, DataObjectType.$class)
    populateComboBox(this.edgeTypeBox, EdgeType.$class)
    populateComboBox(this.portEventTypeBox, EventType.$class)
    populateComboBox(this.portEventCharacteristicBox, EventCharacteristic.$class)

    // create a label model parameter that is used to position the node pop-up
    const nodeLabelModel = new ExteriorLabelModel({ insets: 10 })
    const nodeLabelModelParameter = nodeLabelModel.createParameter(ExteriorLabelModelPosition.NORTH)
    const edgeLabelModelParameter = NinePositionsEdgeLabelModel.CENTER_CENTERED

    // create the pop-ups
    this.createPopup('gateway-popup-content', GatewayNodeStyle.$class, nodeLabelModelParameter)
    this.createPopup('event-popup-content', EventNodeStyle.$class, nodeLabelModelParameter)
    this.createPopup('activity-popup-content', ActivityNodeStyle.$class, nodeLabelModelParameter)
    this.createPopup(
      'conversation-popup-content',
      ConversationNodeStyle.$class,
      nodeLabelModelParameter
    )
    this.createPopup(
      'choreography-popup-content',
      ChoreographyNodeStyle.$class,
      nodeLabelModelParameter
    )
    this.createPopup(
      'data-object-popup-content',
      DataObjectNodeStyle.$class,
      nodeLabelModelParameter
    )
    this.createPopup('pool-popup-content', PoolNodeStyle.$class, nodeLabelModelParameter)
    this.createPopup('edge-popup-content', BpmnEdgeStyle.$class, edgeLabelModelParameter)
    this.createPopup('port-popup-content', EventPortStyle.$class, nodeLabelModelParameter)
  }

  /**
   * Creates a popup for the given style.
   */
  createPopup(
    popupContentName: string,
    styleName: Class<INodeStyle> | Class<IEdgeStyle> | Class<IPortStyle>,
    popupPlacement: ILabelModelParameter
  ): void {
    // get the popup template from the DOM
    const popupContent = window.document.getElementById(popupContentName)!
    // create a popup support using the specified placement and content
    const popup = new BpmnPopup(this.graphComponent, popupContent, popupPlacement)
    // map the node/edge/port style to its popup support
    this.typePopups.set(styleName, popup)
  }

  hasPropertyPopup(clazz: Class): boolean {
    return this.typePopups.has(clazz)
  }

  /**
   * Shows an updated popup for the clicked item.
   */
  showPropertyPopup(clickedItem: IModelItem): void {
    // hide any current popups
    this.hidePropertyPopup()

    // check if a popup support has been mapped to the style of the clicked item
    let popupValue
    const currentItem = clickedItem instanceof ILabel ? clickedItem.owner : clickedItem
    if (
      currentItem instanceof INode ||
      currentItem instanceof IEdge ||
      currentItem instanceof IPort
    ) {
      const style = currentItem.style as (INodeStyle | IEdgeStyle | IPortStyle) & YObject
      const typePopup = this.typePopups.get(style.getClass())
      if (typePopup) {
        popupValue = typePopup
      }
    }

    if (popupValue) {
      // A popup was found for the double-clicked item so we update and show it
      this.activePopup = popupValue
      // update data displayed in the pop-up
      this.updatePopupContent(currentItem!)
      // open pop-up
      this.activePopup.currentItem = currentItem
    }
  }

  /**
   * Hides the active popup by resetting its current item.
   */
  hidePropertyPopup(): void {
    if (this.activePopup) {
      this.activePopup.currentItem = null
      this.activePopup = null
    }
  }

  /**
   * Updates an open popup or closes the popup if the respective item was removed.
   */
  updatePopupState(): void {
    if (!this.activePopup) {
      return
    }
    const item = this.activePopup.currentItem!
    if (this.graphComponent.graph.contains(item)) {
      this.showPropertyPopup(item)
    } else {
      this.hidePropertyPopup()
    }
  }

  /**
   * Updates the popup-content to be in sync with the selected options of the current item.
   * @param item The item for which the popup is assembled.
   */
  updatePopupContent(item: IModelItem): void {
    // for all properties of the current item's style we set the value in the according combo or check box of the
    // active popup
    if (item instanceof INode) {
      const nodeStyle = item.style
      if (nodeStyle instanceof GatewayNodeStyle) {
        this.gatewayTypeBox.value = Enum.getName(GatewayType.$class, nodeStyle.type)
      }

      if (nodeStyle instanceof EventNodeStyle) {
        this.eventTypeBox.value = Enum.getName(EventType.$class, nodeStyle.type)
        this.eventCharacteristicBox.value = Enum.getName(
          EventCharacteristic.$class,
          nodeStyle.characteristic
        )
      }

      if (nodeStyle instanceof ActivityNodeStyle) {
        this.activityTypeBox.value = Enum.getName(ActivityType.$class, nodeStyle.activityType)
        this.activityAdHocCheckBox.checked = nodeStyle.adHoc
        this.activityCompensationCheckBox.checked = nodeStyle.compensation
        this.activityLoopCharacteristicBox.value = Enum.getName(
          LoopCharacteristic.$class,
          nodeStyle.loopCharacteristic
        )
        this.activitySubStateBox.value = Enum.getName(SubState.$class, nodeStyle.subState)
        this.activityTaskTypeBox.value = Enum.getName(TaskType.$class, nodeStyle.taskType)
        if (TaskType.EVENT_TRIGGERED === nodeStyle.taskType) {
          this.activityTriggerEventCharacteristicBox.value = Enum.getName(
            EventCharacteristic.$class,
            nodeStyle.triggerEventCharacteristic
          )
          this.activityTriggerEventCharacteristicBox.disabled = false
          this.activityTriggerEventTypeBox.value = Enum.getName(
            EventType.$class,
            nodeStyle.triggerEventType
          )
          this.activityTriggerEventTypeBox.disabled = false
        } else {
          this.activityTriggerEventCharacteristicBox.selectedIndex = -1
          this.activityTriggerEventCharacteristicBox.disabled = true
          this.activityTriggerEventTypeBox.selectedIndex = -1
          this.activityTriggerEventTypeBox.disabled = true
        }
      }

      if (nodeStyle instanceof ConversationNodeStyle) {
        this.conversationTypeBox.value = Enum.getName(ConversationType.$class, nodeStyle.type)
      }

      if (nodeStyle instanceof ChoreographyNodeStyle) {
        this.choreographyTypeBox.value = Enum.getName(ChoreographyType.$class, nodeStyle.type)
        this.choreographyInitiatingAtTopCheckBox.checked = nodeStyle.initiatingAtTop
        this.choreographyInitiatingMessageCheckBox.checked = nodeStyle.initiatingMessage
        this.choreographyResponseMessageCheckBox.checked = nodeStyle.responseMessage
        this.choreographyLoopCharacteristicBox.value = Enum.getName(
          LoopCharacteristic.$class,
          nodeStyle.loopCharacteristic
        )
        this.choreographySubStateBox.value = Enum.getName(SubState.$class, nodeStyle.subState)
      }

      if (nodeStyle instanceof DataObjectNodeStyle) {
        this.dataObjectTypeBox.value = Enum.getName(DataObjectType.$class, nodeStyle.type)
        this.dataObjectCollectionCheckBox.checked = nodeStyle.collection
      }

      if (nodeStyle instanceof PoolNodeStyle) {
        this.poolMultipleCheckBox.checked = nodeStyle.multipleInstance
      }
    } else if (item instanceof IEdge) {
      const edgeStyle = item.style

      if (edgeStyle instanceof BpmnEdgeStyle) {
        this.edgeTypeBox.value = Enum.getName(EdgeType.$class, edgeStyle.type)
      }
    } else if (item instanceof IPort) {
      const portStyle = item.style
      if (portStyle instanceof EventPortStyle) {
        this.portEventTypeBox.value = Enum.getName(EventType.$class, portStyle.type)
        this.portEventCharacteristicBox.value = Enum.getName(
          EventCharacteristic.$class,
          portStyle.characteristic
        )
      }
    }
  }

  /**
   * This methods configures delete, cut, undo and redo such that the popup stays
   * in sync with the respective item during these operations.
   */
  initializePopupSynchronization(): void {
    const graphEditorInputMode = this.graphComponent.inputMode! as GraphEditorInputMode
    // If the popup for an IModelItem is displayed but the item is deleted, we hide the popup
    graphEditorInputMode.addDeletedItemListener(() => {
      this.updatePopupState()
      this.contextMenu.close()
    })

    // If the popup for an IModelItem is displayed but the item is cut, we hide the popup
    graphEditorInputMode.availableCommands.remove(ICommand.CUT)
    graphEditorInputMode.keyboardInputMode.addCommandBinding(
      ICommand.CUT,
      () => {
        graphEditorInputMode.cut()
        this.updatePopupState()
        this.contextMenu.close()
        return true
      },
      () =>
        GraphItemTypes.enumerableContainsTypes(
          graphEditorInputMode.pasteSelectableItems,
          graphEditorInputMode.graphSelection as IEnumerable<IModelItem>
        )
    )

    // If the popup for an IModelItem is displayed but the item is removed by undo, we hide the popup
    graphEditorInputMode.availableCommands.remove(ICommand.UNDO)
    graphEditorInputMode.keyboardInputMode.addCommandBinding(
      ICommand.UNDO,
      () => {
        graphEditorInputMode.undo()
        this.updatePopupState()
        this.contextMenu.close()
        return true
      },
      () => this.graphComponent.graph.undoEngine!.canUndo()
    )

    // If the popup for an IModelItem is displayed but the item is removed by redo, we hide the popup
    graphEditorInputMode.availableCommands.remove(ICommand.REDO)
    graphEditorInputMode.keyboardInputMode.addCommandBinding(
      ICommand.REDO,
      () => {
        graphEditorInputMode.redo()
        this.updatePopupState()
        this.contextMenu.close()
        return true
      },
      () => this.graphComponent.graph.undoEngine!.canRedo()
    )
  }

  /**
   * Registers commands for each combo and check box that apply the new value to the according style property
   */
  registerPopupCommands(): void {
    this.gatewayTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(GatewayType.$class, this.gatewayTypeBox, (node, value) => {
        ;(node.style as GatewayNodeStyle).type = value
      })
    })

    this.eventTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(EventType.$class, this.eventTypeBox, (node, value) => {
        ;(node.style as EventNodeStyle).type = value
      })
    })

    this.eventCharacteristicBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        EventCharacteristic.$class,
        this.eventCharacteristicBox,
        (node, value) => {
          ;(node.style as EventNodeStyle).characteristic = value
        }
      )
    })

    this.activityTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(ActivityType.$class, this.activityTypeBox, (node, value) => {
        ;(node.style as ActivityNodeStyle).activityType = value
      })
    })

    this.activityAdHocCheckBox.addEventListener('change', () => {
      this.setNodeCheckBoxValue(this.activityAdHocCheckBox, (node, value) => {
        ;(node.style as ActivityNodeStyle).adHoc = value
      })
    })

    this.activityCompensationCheckBox.addEventListener('change', () => {
      this.setNodeCheckBoxValue(this.activityCompensationCheckBox, (node, value) => {
        ;(node.style as ActivityNodeStyle).compensation = value
      })
    })

    this.activityLoopCharacteristicBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        LoopCharacteristic.$class,
        this.activityLoopCharacteristicBox,
        (node, value) => {
          ;(node.style as ActivityNodeStyle).loopCharacteristic = value
        }
      )
    })

    this.activityLoopCharacteristicBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        LoopCharacteristic.$class,
        this.activityLoopCharacteristicBox,
        (node, value) => {
          ;(node.style as ActivityNodeStyle).loopCharacteristic = value
        }
      )
    })

    this.activitySubStateBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(SubState.$class, this.activitySubStateBox, (node, value) => {
        ;(node.style as ActivityNodeStyle).subState = value
      })
    })

    this.activityTaskTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(TaskType.$class, this.activityTaskTypeBox, (node, value) => {
        const style = node.style as ActivityNodeStyle
        style.taskType = value
        if (TaskType.EVENT_TRIGGERED === value) {
          this.activityTriggerEventCharacteristicBox.value = Enum.getName(
            EventCharacteristic.$class,
            style.triggerEventCharacteristic
          )
          this.activityTriggerEventCharacteristicBox.disabled = false
          this.activityTriggerEventTypeBox.value = Enum.getName(
            EventType.$class,
            style.triggerEventType
          )
          this.activityTriggerEventTypeBox.disabled = false
        } else {
          this.activityTriggerEventCharacteristicBox.selectedIndex = -1
          this.activityTriggerEventCharacteristicBox.disabled = true
          this.activityTriggerEventTypeBox.selectedIndex = -1
          this.activityTriggerEventTypeBox.disabled = true
        }
      })
    })

    this.activityTriggerEventCharacteristicBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        EventCharacteristic.$class,
        this.activityTriggerEventCharacteristicBox,
        (node, value) => {
          ;(node.style as ActivityNodeStyle).triggerEventCharacteristic = value
        }
      )
    })

    this.activityTriggerEventTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        EventType.$class,
        this.activityTriggerEventTypeBox,
        (node, value) => {
          ;(node.style as ActivityNodeStyle).triggerEventType = value
        }
      )
    })

    this.conversationTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        ConversationType.$class,
        this.conversationTypeBox,
        (node, value) => {
          ;(node.style as ConversationNodeStyle).type = value
        }
      )
    })

    this.choreographyTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        ChoreographyType.$class,
        this.choreographyTypeBox,
        (node, value) => {
          ;(node.style as ChoreographyNodeStyle).type = value
        }
      )
    })

    this.choreographyInitiatingAtTopCheckBox.addEventListener('change', () => {
      this.setNodeCheckBoxValue(this.choreographyInitiatingAtTopCheckBox, (node, value) => {
        ;(node.style as ChoreographyNodeStyle).initiatingAtTop = value
      })
    })

    this.choreographyInitiatingMessageCheckBox.addEventListener('change', () => {
      this.setNodeCheckBoxValue(this.choreographyInitiatingMessageCheckBox, (node, value) => {
        ;(node.style as ChoreographyNodeStyle).initiatingMessage = value
      })
    })

    this.choreographyResponseMessageCheckBox.addEventListener('change', () => {
      this.setNodeCheckBoxValue(this.choreographyResponseMessageCheckBox, (node, value) => {
        ;(node.style as ChoreographyNodeStyle).responseMessage = value
      })
    })

    this.choreographyLoopCharacteristicBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(
        LoopCharacteristic.$class,
        this.choreographyLoopCharacteristicBox,
        (node, value) => {
          ;(node.style as ChoreographyNodeStyle).loopCharacteristic = value
        }
      )
    })

    this.choreographySubStateBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(SubState.$class, this.choreographySubStateBox, (node, value) => {
        ;(node.style as ChoreographyNodeStyle).subState = value
      })
    })

    this.dataObjectTypeBox.addEventListener('change', () => {
      this.setNodeComboBoxValue(DataObjectType.$class, this.dataObjectTypeBox, (node, value) => {
        ;(node.style as DataObjectNodeStyle).type = value
      })
    })

    this.dataObjectCollectionCheckBox.addEventListener('change', () => {
      this.setNodeCheckBoxValue(this.dataObjectCollectionCheckBox, (node, value) => {
        ;(node.style as DataObjectNodeStyle).collection = value
      })
    })

    this.poolMultipleCheckBox.addEventListener('click', () => {
      this.setNodeCheckBoxValue(this.poolMultipleCheckBox, (node, value) => {
        ;(node.style as PoolNodeStyle).multipleInstance = value
      })
    })

    this.edgeTypeBox.addEventListener('change', () => {
      this.setEdgeType()
    })

    this.portEventTypeBox.addEventListener('change', () => {
      this.setPortComboBoxValue(EventType.$class, this.portEventTypeBox, (port, value) => {
        ;((port as INode).style as EventNodeStyle).type = value
      })
    })

    this.portEventCharacteristicBox.addEventListener('change', () => {
      this.setPortComboBoxValue(
        EventCharacteristic.$class,
        this.portEventCharacteristicBox,
        (port, value) => {
          ;((port as INode).style as EventNodeStyle).characteristic = value
        }
      )
    })

    document.querySelectorAll('.close-popup-button').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.hidePropertyPopup()
      })
    )
  }

  /**
   * Set the value of the check box to the according node style property
   */
  setNodeCheckBoxValue(
    checkBox: HTMLInputElement,
    setter: (arg0: INode, arg1: boolean) => void
  ): void {
    if (!this.activePopup || !this.activePopup.currentItem) {
      return
    }
    const node = this.activePopup.currentItem as INode
    this.graphComponent.graph.setStyle(node, node.style.clone())
    setter(node, checkBox.checked)
    this.graphComponent.invalidate()
  }

  /**
   * Sets the value of the combo box to the according node style property.
   */
  setNodeComboBoxValue(
    enumType: Class,
    comboBox: HTMLSelectElement,
    setter: (arg0: INode, arg1: number) => void
  ): void {
    if (!this.activePopup || !this.activePopup.currentItem) {
      return
    }
    const node = this.activePopup.currentItem as INode
    this.graphComponent.graph.setStyle(node, node.style.clone())
    const value = Enum.parse(enumType, comboBox.value, true)
    setter(node, value)
    this.graphComponent.invalidate()
  }

  /**
   * Sets the value of the combo box to the according port style property.
   */
  setPortComboBoxValue(
    enumType: Class,
    comboBox: HTMLSelectElement,
    setter: (arg0: IModelItem, arg1: number) => void
  ): void {
    if (!this.activePopup || !this.activePopup.currentItem) {
      return
    }
    const port = this.activePopup.currentItem as INode
    this.graphComponent.graph.setStyle(port, port.style.clone())
    const value = Enum.parse(enumType, comboBox.value, true)
    setter(port, value)
    this.graphComponent.invalidate()
  }

  /**
   * Sets the edge style according to the current type.
   */
  setEdgeType(): void {
    // use the specified setter to set the value of the check box to the according node style property
    if (!this.activePopup || !this.activePopup.currentItem) {
      return
    }
    const edge = this.activePopup.currentItem as IEdge
    this.graphComponent.graph.setStyle(edge, edge.style.clone())
    ;(edge.style as BpmnEdgeStyle).type = Enum.parse(EdgeType.$class, this.edgeTypeBox.value, true)
    this.graphComponent.invalidate()
  }
}

/**
 * Adds options to the given combo box for the content of the enum type.
 */
function populateComboBox(comboBox: HTMLSelectElement, enumType: Class): void {
  Enum.getValueNames(enumType).forEach((name) => {
    const option = document.createElement('option')
    option.innerText = getFriendlyName(name)
    option.value = name
    comboBox.options.add(option)
  })
}

/** Returns a readable name for all-caps enum constants. */
function getFriendlyName(name: string) {
  // First character in uppercase
  let result = name.substring(0, 1) + name.substring(1).toLowerCase()
  // Dashes where necessary
  result = result.replace(/(sub|non)_/g, '$1-')
  // Replace underscores with spaces
  result = result.replace(/_/g, ' ')
  return result
}
