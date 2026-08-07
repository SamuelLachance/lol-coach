/**
 * Regression logistique L2 sur features creuses, optimiseur Adam plein batch.
 * Deterministe (aucun tirage aleatoire), pas de dependance externe.
 */

export function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * rows : [{ idx: Int32Array, val: Float64Array, y: 0|1 }]
 * nFeatures : nombre de colonnes
 * opts : { lambda, epochs, lr }
 * Le biais n'est pas regularise.
 */
export function fitLogreg(rows, nFeatures, opts = {}) {
  const lambda = opts.lambda ?? 1;
  const epochs = opts.epochs ?? 300;
  const lr = opts.lr ?? 0.1;
  const n = rows.length;
  const w = new Float64Array(nFeatures);
  let b = 0;
  const m = new Float64Array(nFeatures);
  const v = new Float64Array(nFeatures);
  let mb = 0;
  let vb = 0;
  const grad = new Float64Array(nFeatures);
  const b1 = 0.9;
  const b2 = 0.999;
  const eps = 1e-8;
  // Init du biais sur la prevalence
  let pos = 0;
  for (const r of rows) pos += r.y;
  const p0 = Math.min(Math.max(pos / Math.max(1, n), 1e-6), 1 - 1e-6);
  b = Math.log(p0 / (1 - p0));

  for (let t = 1; t <= epochs; t += 1) {
    grad.fill(0);
    let gb = 0;
    for (let i = 0; i < n; i += 1) {
      const r = rows[i];
      let z = b;
      const idx = r.idx;
      const val = r.val;
      for (let j = 0; j < idx.length; j += 1) z += w[idx[j]] * val[j];
      const d = sigmoid(z) - r.y;
      gb += d;
      for (let j = 0; j < idx.length; j += 1) grad[idx[j]] += d * val[j];
    }
    const inv = 1 / n;
    const bc1 = 1 - Math.pow(b1, t);
    const bc2 = 1 - Math.pow(b2, t);
    for (let k = 0; k < nFeatures; k += 1) {
      const g = grad[k] * inv + lambda * w[k];
      m[k] = b1 * m[k] + (1 - b1) * g;
      v[k] = b2 * v[k] + (1 - b2) * g * g;
      w[k] -= (lr * (m[k] / bc1)) / (Math.sqrt(v[k] / bc2) + eps);
    }
    const g = gb * inv;
    mb = b1 * mb + (1 - b1) * g;
    vb = b2 * vb + (1 - b2) * g * g;
    b -= (lr * (mb / bc1)) / (Math.sqrt(vb / bc2) + eps);
  }
  return { w, b };
}

export function predict(model, row) {
  let z = model.b;
  for (let j = 0; j < row.idx.length; j += 1) z += model.w[row.idx[j]] * row.val[j];
  return sigmoid(z);
}

export function metrics(preds, ys) {
  const n = preds.length;
  let acc = 0;
  let brier = 0;
  let ll = 0;
  for (let i = 0; i < n; i += 1) {
    const p = Math.min(Math.max(preds[i], 1e-12), 1 - 1e-12);
    const y = ys[i];
    if ((p >= 0.5 ? 1 : 0) === y) acc += 1;
    brier += (p - y) * (p - y);
    ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  }
  return { n, acc: acc / n, correct: acc, brier: brier / n, logloss: ll / n };
}
