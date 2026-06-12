import { jsPDF } from 'jspdf'
import type { LivenessCheckResult, LivenessEngineConfig, DebugMetrics } from '../core/types'
import type { KtpOcrResult } from './historyStorage'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportData {
  result?: LivenessCheckResult // Optional for pure KTP reports
  type?: 'liveness' | 'ktp'
  config: LivenessEngineConfig
  screenshot: string | undefined // base64 data URL
  debugMetrics: DebugMetrics | null
  modelInfo: ModelInfo
  timestamp: number
  ktpData?: KtpOcrResult
}

export interface ModelInfo {
  antiSpoof: {
    method: 'onnx' | 'heuristic'
    modelName: string | null
    modelSize: string | null
    inputShape: string | null
    outputShape: string | null
  }
  challenges: {
    blink: {
      method: 'onnx' | 'heuristic'
      modelName: string | null
      threshold: number | null
    }
    smile: {
      method: 'onnx' | 'heuristic'
      modelName: string | null
      threshold: number | null
    }
  }
  heuristics: {
    earThreshold: number
    smileCornerLift: number
    nodThreshold: number
    shakeThreshold: number
  }
}

// ── PDF Generator ─────────────────────────────────────────────────────────────

export async function generateReport(data: ReportData): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  let y = margin
  const isKtp = data.type === 'ktp'

  // ── Header ────────────────────────────────────────────────────────────────
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text(isKtp ? 'KTP Verification Report' : 'Liveness Detection Report', margin, y)
  y += 10

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 100, 100)
  pdf.text(`Generated: ${new Date(data.timestamp).toLocaleString('id-ID')}`, margin, y)
  if (data.result?.sessionId) {
    pdf.text(`Session ID: ${data.result.sessionId}`, margin, y + 5)
  }
  y += 15

  // ── Status Badge ──────────────────────────────────────────────────────────
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  const status = data.result?.status || 'passed'
  if (status === 'passed') {
    pdf.setFillColor(34, 197, 94) // green
    pdf.setTextColor(255, 255, 255)
  } else {
    pdf.setFillColor(239, 68, 68) // red
    pdf.setTextColor(255, 255, 255)
  }
  pdf.rect(margin, y, 40, 10, 'F')
  pdf.text(status.toUpperCase(), margin + 20, y + 7, { align: 'center' })

  pdf.setTextColor(0, 0, 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)
  if (data.result) {
    pdf.text(`Score: ${data.result.score.toFixed(2)}`, margin + 50, y + 7)
  }
  y += 20

  // ── Screenshot ────────────────────────────────────────────────────────────
  if (data.screenshot) {
    try {
      const imgWidth = 60
      const imgHeight = 80
      pdf.addImage(data.screenshot, 'JPEG', margin, y, imgWidth, imgHeight)

      // Info di samping screenshot
      const infoX = margin + imgWidth + 10
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Verification Details', infoX, y + 5)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      let infoY = y + 12

      if (data.result.failReason) {
        pdf.setTextColor(239, 68, 68)
        pdf.text(`Fail Reason: ${data.result.failReason}`, infoX, infoY)
        pdf.setTextColor(0, 0, 0)
        infoY += 5
      }

      pdf.text(`Anti-Spoof: ${data.result.antiSpoof.isReal ? 'REAL' : 'FAKE'} (${(data.result.antiSpoof.score * 100).toFixed(1)}%)`, infoX, infoY)
      infoY += 5
      pdf.text(`Method: ${data.result.antiSpoof.method}`, infoX, infoY)
      infoY += 5
      pdf.text(`Quality: ${data.result.quality.passed ? 'PASS' : 'FAIL'}`, infoX, infoY)
      infoY += 5
      pdf.text(`  Brightness: ${data.result.quality.brightness.toFixed(0)}`, infoX, infoY)
      infoY += 5
      pdf.text(`  Blur Score: ${data.result.quality.blurScore.toFixed(0)}`, infoX, infoY)
      infoY += 5
      pdf.text(`  Face Size: ${(data.result.quality.faceSize * 100).toFixed(1)}%`, infoX, infoY)

      y += imgHeight + 10
    } catch (error) {
      console.error('Failed to add screenshot to PDF:', error)
      y += 10
    }
  }

  // ── KTP Data (if available) ───────────────────────────────────────────────
  if (data.ktpData) {
    if (y > pageHeight - 120) {
      pdf.addPage()
      y = margin
    }

    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Data Terdeteksi (OCR)', margin, y)
    y += 10

    pdf.setFontSize(9)
    const k = data.ktpData
    const lineHeight = 6
    const col1X = margin
    const col1W = 35
    const col2X = margin + col1W
    const col3X = margin + 90
    const col3W = 40
    const col4X = col3X + col3W

    const printRow = (label1: string, val1: string, label2?: string, val2?: string) => {
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(100, 100, 100)
      pdf.text(label1, col1X, y)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(0, 0, 0)
      pdf.text(val1 || '-', col2X, y)

      if (label2 !== undefined) {
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(100, 100, 100)
        pdf.text(label2, col3X, y)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(0, 0, 0)
        pdf.text(val2 || '-', col4X, y)
      }
      y += lineHeight
    }

    printRow('NIK:', k.nik, 'Agama:', k.agama)
    printRow('Nama:', k.nama, 'Status Perkawinan:', k.status_perkawinan)
    printRow('Tempat Lahir:', k.tempatLahir, 'Pekerjaan:', k.pekerjaan)
    printRow('Tanggal Lahir:', k.tanggalLahir, 'Kewarganegaraan:', k.kewarganegaraan)
    printRow('Jenis Kelamin:', k.jenis_kelamin, 'Berlaku Hingga:', k.berlaku_hingga)
    printRow('Golongan Darah:', k.golongan_darah)
    y += 2

    // Alamat block (Bisa panjang)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 100, 100)
    pdf.text('Alamat:', col1X, y)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(k.alamat || '-', col2X, y)
    y += lineHeight

    printRow('RT/RW:', k.rt_rw, 'Kecamatan:', k.kecamatan)
    printRow('Kel/Desa:', k.kelurahan_desa)

    y += 10
  }

  // ── Challenge Results ─────────────────────────────────────────────────────
  if (!isKtp) {
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Challenge Results', margin, y)
    y += 7

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')

    if (!data.result || data.result.challengesPassed.length === 0) {
      pdf.text('No challenges completed', margin, y)
      y += 7
    } else {
      data.result.challengesPassed.forEach((ch, idx) => {
        const status = ch.passed ? '✓ PASS' : '✗ FAIL'
        const color: [number, number, number] = ch.passed ? [34, 197, 94] : [239, 68, 68]
        pdf.setTextColor(color[0], color[1], color[2])
        pdf.text(`${idx + 1}. ${ch.type.toUpperCase()}: ${status} (${ch.duration}ms)`, margin, y)
        pdf.setTextColor(0, 0, 0)
        y += 5
      })
      y += 5
    }

    // ── Model Information ─────────────────────────────────────────────────────
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Model & Configuration', margin, y)
    y += 7

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')

    // Anti-Spoof Model
    pdf.setFont('helvetica', 'bold')
    pdf.text('Anti-Spoof:', margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 5
    pdf.text(`  Method: ${data.modelInfo.antiSpoof.method}`, margin, y)
    y += 5
    if (data.modelInfo.antiSpoof.modelName) {
      pdf.text(`  Model: ${data.modelInfo.antiSpoof.modelName}`, margin, y)
      y += 5
      if (data.modelInfo.antiSpoof.inputShape) {
        pdf.text(`  Input: ${data.modelInfo.antiSpoof.inputShape}`, margin, y)
        y += 5
      }
    } else {
      pdf.text(`  Using heuristic (rPPG, deformation, LBP, artifacts)`, margin, y)
      y += 5
    }
    y += 3

    // Challenge Models
    pdf.setFont('helvetica', 'bold')
    pdf.text('Challenge Detection:', margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 5

    pdf.text(`  Blink: ${data.modelInfo.challenges.blink.method}`, margin, y)
    y += 5
    if (data.modelInfo.challenges.blink.modelName) {
      pdf.text(`    Model: ${data.modelInfo.challenges.blink.modelName}`, margin, y)
      y += 5
      pdf.text(`    Threshold: ${data.modelInfo.challenges.blink.threshold}`, margin, y)
      y += 5
    } else {
      pdf.text(`    Using EAR heuristic (threshold: ${data.modelInfo.heuristics.earThreshold})`, margin, y)
      y += 5
    }

    pdf.text(`  Smile: ${data.modelInfo.challenges.smile.method}`, margin, y)
    y += 5
    if (data.modelInfo.challenges.smile.modelName) {
      pdf.text(`    Model: ${data.modelInfo.challenges.smile.modelName}`, margin, y)
      y += 5
      pdf.text(`    Threshold: ${data.modelInfo.challenges.smile.threshold}`, margin, y)
      y += 5
    } else {
      pdf.text(`    Using corner-lift heuristic (threshold: ${data.modelInfo.heuristics.smileCornerLift})`, margin, y)
      y += 5
    }
    y += 3

    // Heuristic Thresholds
    pdf.setFont('helvetica', 'bold')
    pdf.text('Heuristic Thresholds:', margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 5
    pdf.text(`  EAR (blink): ${data.modelInfo.heuristics.earThreshold}`, margin, y)
    y += 5
    pdf.text(`  Smile corner lift: ${data.modelInfo.heuristics.smileCornerLift}`, margin, y)
    y += 5
    pdf.text(`  Nod (pitch delta): ${data.modelInfo.heuristics.nodThreshold}°`, margin, y)
    y += 5
    pdf.text(`  Shake (yaw delta): ${data.modelInfo.heuristics.shakeThreshold}°`, margin, y)
    y += 8

    // ── Configuration ─────────────────────────────────────────────────────────
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Session Configuration', margin, y)
    y += 7

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Anti-Spoof Threshold: ${data.config.antiSpoofThreshold}`, margin, y)
    y += 5
    pdf.text(`Pass Score: ${data.config.passScore}`, margin, y)
    y += 5
    pdf.text(`Challenge Count: ${data.config.challengeCount}`, margin, y)
    y += 5
    pdf.text(`Challenge Timeout: ${data.config.challengeTimeoutMs}ms`, margin, y)
    y += 5
    pdf.text(`Enabled Challenges: ${data.config.enabledChallenges.join(', ')}`, margin, y)
    y += 5
    pdf.text(`Quality - Brightness: ${data.config.minBrightness}-${data.config.maxBrightness}`, margin, y)
    y += 5
    pdf.text(`Quality - Min Blur Score: ${data.config.minBlurScore}`, margin, y)
    y += 5
    pdf.text(`Quality - Face Size: ${(data.config.minFaceSize * 100).toFixed(0)}%-${(data.config.maxFaceSize * 100).toFixed(0)}%`, margin, y)
    y += 8

    // ── Debug Metrics (if available) ──────────────────────────────────────────
    if (data.debugMetrics) {
      const m = data.debugMetrics

      // Check if we need new page
      if (y > pageHeight - 60) {
        pdf.addPage()
        y = margin
      }

      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Debug Metrics (Last Frame)', margin, y)
      y += 7

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Frame Count: ${m.frameCount} | FPS: ${m.fps}`, margin, y)
      y += 5
      pdf.text(`EAR (Left/Right/Avg): ${m.earLeft.toFixed(3)} / ${m.earRight.toFixed(3)} / ${m.earAvg.toFixed(3)}`, margin, y)
      y += 5
      pdf.text(`MAR: ${m.mar.toFixed(3)}`, margin, y)
      y += 5
      pdf.text(`Smile Lift (L/R): ${m.smileLeftLift.toFixed(4)} / ${m.smileRightLift.toFixed(4)}`, margin, y)
      y += 5
      pdf.text(`Smile Heuristic: ${m.smileHeuristicPass ? 'PASS' : 'FAIL'}`, margin, y)
      y += 5
      if (m.smileOnnxProb !== null) {
        pdf.text(`Smile ONNX Prob: ${m.smileOnnxProb.toFixed(3)} (${m.smileOnnxPass ? 'PASS' : 'FAIL'})`, margin, y)
        y += 5
      }
      pdf.text(`Head Pose - Yaw LM: ${m.yaw.toFixed(1)} | Pitch LM: ${m.pitch.toFixed(1)}`, margin, y)
      y += 5
      if (m.headPoseYawOnnx !== null) {
        pdf.text(
          `Head Pose ONNX: yaw ${m.headPoseYawOnnx.toFixed(3)} pitch ${m.headPosePitchOnnx?.toFixed(3) ?? '—'} roll ${m.headPoseRollOnnx?.toFixed(3) ?? '—'}`,
          margin,
          y,
        )
        y += 5
      }
      if (m.nodPhase) {
        pdf.text(
          `Nod: fase=${m.nodPhase} ΔLM=${m.nodDeltaLm?.toFixed(2) ?? '—'} ΔONNX=${m.nodDeltaOnnx?.toFixed(3) ?? '—'} pass=${m.nodPass}`,
          margin,
          y,
        )
        y += 5
      }
      if (m.yawPhase) {
        pdf.text(
          `Yaw: fase=${m.yawPhase} ΔLM=${m.yawDeltaLm?.toFixed(2) ?? '—'} ΔONNX=${m.yawDeltaOnnx?.toFixed(3) ?? '—'} pass=${m.yawPass}`,
          margin,
          y,
        )
        y += 5
      }
      pdf.text(`Anti-Spoof Score: ${m.antiSpoofScore?.toFixed(3) ?? 'N/A'} (${m.antiSpoofMethod})`, margin, y)
      y += 5
      if (m.challengeType) {
        pdf.text(`Current Challenge: ${m.challengeType} (${m.challengePassed ? 'PASSED' : 'IN PROGRESS'})`, margin, y)
        y += 5
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  pdf.setFontSize(8)
  pdf.setTextColor(150, 150, 150)
  pdf.text(
    'Generated by Liveness Detection SDK v1.0.0',
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  )

  // ── Save PDF ──────────────────────────────────────────────────────────────
  const filename = `liveness-report-${data.result.sessionId.slice(0, 8)}-${Date.now()}.pdf`
  pdf.save(filename)
}

// ── Helper: Get Model Info ────────────────────────────────────────────────────

export function getModelInfo(): ModelInfo {
  return {
    antiSpoof: {
      method: 'onnx', // akan di-update dari runtime
      modelName: 'MiniFASNet.onnx',
      modelSize: '967 KB',
      inputShape: '[1, 3, 80, 80] BGR',
      outputShape: '[1, 2] [live, spoof]',
    },
    challenges: {
      blink: {
        method: 'heuristic',
        modelName: null,
        threshold: null,
      },
      smile: {
        method: 'onnx',
        modelName: 'smile_detect.onnx',
        threshold: 0.38,
      },
    },
    heuristics: {
      earThreshold: 0.18,
      smileCornerLift: 0.018,
      nodThreshold: 12,
      shakeThreshold: 14,
    },
  }
}
