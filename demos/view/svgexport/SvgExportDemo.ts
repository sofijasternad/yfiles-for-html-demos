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
import { GraphComponent, GraphEditorInputMode, License, SvgExport } from 'yfiles'
import { applyDemoTheme, initDemoStyles } from 'demo-resources/demo-styles'
import { fetchLicense } from 'demo-resources/fetch-license'
import { finishLoading } from 'demo-resources/demo-page'
import { initializeToggleWebGl2RenderingButton } from './webgl-support'
import { initializeExportRectangle } from './export-rectangle/export-rectangle'
import { createSampleGraph } from './samples'
import './option-panel/option-panel.css'
import { initializeOptionPanel } from './option-panel/option-panel'
import { exportSvg } from './svg-export'
import { initializeExportDialog, showExportDialog } from './export-dialog/export-dialog'
import { retainAspectRatio } from './aspect-ratio'
import { downloadFile } from 'demo-utils/file-support'

async function run(): Promise<void> {
  License.value = await fetchLicense()

  if (window.location.protocol === 'file:') {
    alert(
      'This demo features image export with inlined images. ' +
        'Due to the browsers security settings, images cannot be inlined if the demo is started from the file system. ' +
        'Please start the demo from a web server.'
    )
  }

  // initialize the main graph component
  const graphComponent = new GraphComponent('graphComponent')
  graphComponent.inputMode = new GraphEditorInputMode()
  applyDemoTheme(graphComponent)
  initDemoStyles(graphComponent.graph)
  retainAspectRatio(graphComponent.graph)

  const exportRect = initializeExportRectangle(graphComponent)

  initializeOptionPanel(async (options) => {
    const element = await exportSvg(
      graphComponent,
      options.scale,
      options.background,
      options.useExportRectangle ? exportRect.toRect() : null
    )
    showExportDialog(element)
  })

  initializeExportDialog('SVG Export', (svgElement: Element) => {
    const fileContent = SvgExport.exportSvgString(svgElement)
    try {
      downloadFile(fileContent, 'graph.svg')
    } catch (e) {
      alert(
        'Saving directly to the filesystem is not supported by this browser.' +
          ' Please use the server-based export instead.'
      )
    }
  })

  // wire up the export button
  initializeToggleWebGl2RenderingButton(graphComponent)

  // create a sample graph
  await createSampleGraph(graphComponent)
  graphComponent.fitGraphBounds()
}

void run().then(finishLoading)
