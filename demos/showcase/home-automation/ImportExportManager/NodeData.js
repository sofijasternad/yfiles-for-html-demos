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
import { IGraph, INode, Point } from 'yfiles'
import { createInGraph, validateNodeTag } from '../FlowNode/FlowNode.js'

/**
 * @typedef {Object} SerializableNodeData
 * @property {Array.<number>} position
 * @property {Omit.<FlowNodeProperties,('validate'|'hasLeftPort'|'hasRightPort')>} properties
 */

/**
 * @typedef {SerializableNodeData} NodeDataOptions
 */

/**
 * A simple, minimal data structure that can be used for storing a FlowNode in JSON
 * and then re-create it in the graph.
 */
export class NodeData {
  position
  properties

  /**
   * Creates NodeData from an actual node. We exclude the validator function,
   * if present as it cannot be serialized, and it will be automatically set
   * on node re-creation anyway.
   * @param {!INode} undefined
   * @returns {!NodeData}
   */
  static fromGraphItem({ tag, layout }) {
    const keysToFilter = ['validate', 'hasLeftPort', 'hasRightPort']
    if (!validateNodeTag(tag)) {
      throw new Error('Invalid node tag')
    }
    const properties = Object.fromEntries(
      Object.entries(tag).filter(([key]) => !keysToFilter.includes(key))
    )
    return new NodeData({
      properties,
      position: [layout.x, layout.y]
    })
  }

  /**
   * Converts an arbitrary piece of data to NodeData after validation.
   * @param {!unknown} data
   * @returns {!NodeData}
   */
  static fromJSONData(data) {
    NodeData.validate(data)
    return new NodeData(data)
  }

  /**
   * Checks if an arbitrary piece of data (as it comes from a JSON source)
   * conforms to the format required by NodeData.
   * @param {!unknown} data
   * @returns {!SerializableNodeData}
   */
  static validate(data) {
    if (
      data !== null &&
      typeof data === 'object' &&
      Array.isArray(data.position) &&
      Number.isFinite(data.position[0]) &&
      Number.isFinite(data.position[1]) &&
      validateNodeTag(data.properties)
    ) {
      return
    }
    throw new Error('Malformed node data')
  }

  /**
   * @param {!NodeDataOptions} undefined
   */
  constructor({ properties, position }) {
    this.position = position
    this.properties = properties
  }

  /**
   * Converts node data to an actual graph node.
   * @param {!IGraph} graph
   * @returns {!INode}
   */
  createGraphItem(graph) {
    const node = createInGraph({
      graph,
      variant: this.properties.variant,
      position: new Point(...this.position)
    })
    node.tag = {
      ...node.tag,
      ...this.properties
    }
    return node
  }

  /**
   * Converts node data to a serializable format.
   * @returns {!SerializableNodeData}
   */
  toJSONData() {
    return {
      position: this.position,
      properties: this.properties
    }
  }
}
