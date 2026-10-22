
    const PLAYERS = [
      'Abid', 'Amrit', 'Ari', 'Brian', 'David',
      'Jacob', 'KingCong', 'Luis', 'Matt', 'Max',
      'Parsa', 'Zach'
    ];
    const TOTAL_DISCREPANCY = 525;

    // Collapsible toggle
    function toggleCollapse(id) {
      const body = document.getElementById(id);
      const icon = document.getElementById(id + '-icon');
      body.classList.toggle('collapsed');
      icon.innerHTML = body.classList.contains('collapsed') ? '&#x25BC;' : '&#x25B2;';
    }

    // +/- button handlers
    function adjustWeight(index, delta) {
      const input = document.getElementById(`w-${index}`);
      let val = parseFloat(input.value);
      if (isNaN(val)) val = 0;
      val = Math.max(0, val + delta);
      input.value = val;
      updatePercentages();
    }

    // Build the weight form
    function buildTable() {
      const tbody = document.getElementById('weight-body');
      PLAYERS.forEach((name, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="player-name">${name}</td>
          <td>
            <div class="weight-group">
              <button type="button" class="weight-btn" onclick="adjustWeight(${i}, -1)" aria-label="Decrease">&minus;</button>
              <input type="number" class="weight-input" id="w-${i}"
                min="0" value="0" step="any"
                oninput="updatePercentages()" onchange="updatePercentages()">
              <button type="button" class="weight-btn" onclick="adjustWeight(${i}, 1)" aria-label="Increase">+</button>
            </div>
          </td>
          <td class="pct-cell" id="p-${i}">0%</td>
        `;
        tbody.appendChild(tr);
      });
    }

    function getWeights() {
      return PLAYERS.map((_, i) => {
        const val = parseFloat(document.getElementById(`w-${i}`).value);
        return isNaN(val) || val < 0 ? 0 : val;
      });
    }

    // Format percentage: use as many decimal places as needed up to 2
    function formatPct(pct) {
      const rounded = Math.round(pct * 100) / 100; // Round to 2 decimal places
      const str = rounded.toFixed(2);
      // Remove trailing zeros and decimal point if not needed
      return str.replace(/\.?0+$/, '') + '%';
    }

    // Returns a color from gray (0%) through yellow to red (high %)
    function pctColor(pct) {
      if (pct === 0) return '#555';
      // For any value > 0, start with a clearly visible warm color (light yellow)
      // This ensures even tiny percentages are clearly distinct from gray
      const minColor = { r: 180, g: 160, b: 100 }; // Light warm yellow/beige
      const maxYellow = { r: 232, g: 197, b: 71 }; // Bright yellow
      const maxRed = { r: 255, g: 70, b: 50 };     // Bright red

      // Clamp to a useful range: treat anything above 50% as max intensity
      const t = Math.min(pct / 50, 1);

      if (t <= 0.5) {
        // Light yellow -> bright yellow (any % > 0 -> 25%)
        // Even the smallest % gets the minimum warm color
        const s = t * 2; // 0..1
        const r = Math.round(minColor.r + s * (maxYellow.r - minColor.r));
        const g = Math.round(minColor.g + s * (maxYellow.g - minColor.g));
        const b = Math.round(minColor.b + s * (maxYellow.b - minColor.b));
        return `rgb(${r},${g},${b})`;
      } else {
        // yellow -> red (25% -> 50%+)
        const s = (t - 0.5) * 2; // 0..1
        const r = Math.round(maxYellow.r + s * (maxRed.r - maxYellow.r));
        const g = Math.round(maxYellow.g + s * (maxRed.g - maxYellow.g));
        const b = Math.round(maxYellow.b + s * (maxRed.b - maxYellow.b));
        return `rgb(${r},${g},${b})`;
      }
    }

    function updatePercentages() {
      const weights = getWeights();
      const total = weights.reduce((a, b) => a + b, 0);
      const btn = document.getElementById('generate-btn');

      PLAYERS.forEach((_, i) => {
        const pct = total > 0 ? (weights[i] / total) * 100 : 0;
        const el = document.getElementById(`p-${i}`);
        el.textContent = formatPct(pct);
        el.style.color = pctColor(pct);
      });

      btn.disabled = total === 0;
    }

    // Encode weights into an opaque Base64 code with random salt
    function encode(weights) {
      const salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      const payload = {
        v: 1,
        s: Array.from(salt),
        w: weights
      };
      return btoa(JSON.stringify(payload));
    }

    // Decode a code back into weights
    function decode(code) {
      try {
        const payload = JSON.parse(atob(code.trim()));
        if (payload.v !== 1 || !Array.isArray(payload.w) || payload.w.length !== PLAYERS.length) {
          return null;
        }
        return payload.w.map(v => {
          const n = parseFloat(v);
          return isNaN(n) || n < 0 ? 0 : n;
        });
      } catch {
        return null;
      }
    }

    async function generateCode() {
      const weights = getWeights();
      const total = weights.reduce((a, b) => a + b, 0);
      if (total === 0) return;

      const code = encode(weights);

      try {
        await navigator.clipboard.writeText(code);
        showToast('Code copied to clipboard!');
      } catch {
        // Fallback: select a temporary textarea
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Code copied to clipboard!');
      }
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function calculateAverage() {
      const input = document.getElementById('codes-input').value.trim();
      const errEl = document.getElementById('agg-error');
      const resultsCard = document.getElementById('results-card');

      errEl.classList.add('hidden');
      resultsCard.classList.add('hidden');

      if (!input) {
        errEl.textContent = 'Please paste at least one code.';
        errEl.classList.remove('hidden');
        return;
      }

      const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const allWeights = [];
      const badLines = [];

      lines.forEach((line, idx) => {
        const w = decode(line);
        if (w === null) {
          badLines.push(idx + 1);
        } else {
          allWeights.push(w);
        }
      });

      if (badLines.length > 0) {
        errEl.textContent = `Invalid code(s) on line(s): ${badLines.join(', ')}. Check for typos or extra whitespace.`;
        errEl.classList.remove('hidden');
        if (allWeights.length === 0) return;
      }

      if (allWeights.length === 0) {
        errEl.textContent = 'No valid codes found.';
        errEl.classList.remove('hidden');
        return;
      }

      // For each submission, convert weights to percentages, then average the percentages
      const pctSums = new Array(PLAYERS.length).fill(0);

      allWeights.forEach(weights => {
        const total = weights.reduce((a, b) => a + b, 0);
        if (total === 0) return;
        weights.forEach((w, i) => {
          pctSums[i] += (w / total) * 100;
        });
      });

      const n = allWeights.length;
      const avgPcts = pctSums.map(s => s / n);

      // Render results
      const tbody = document.getElementById('results-body');
      tbody.innerHTML = '';

      // Sort by % descending for easy reading
      const indexed = avgPcts.map((pct, i) => ({ name: PLAYERS[i], pct }));
      indexed.sort((a, b) => b.pct - a.pct);

      indexed.forEach(({ name, pct }) => {
        const amount = (pct / 100) * TOTAL_DISCREPANCY;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="player-name">${name}</td>
          <td class="pct-result">${formatPct(pct)}</td>
          <td class="amount-cell">$${amount.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
      });

      document.getElementById('results-meta').textContent =
        `Based on ${n} submission${n !== 1 ? 's' : ''} (equal weight each)`;

      resultsCard.classList.remove('hidden');
    }

    // Tab switching
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach((el, i) => {
        el.classList.toggle('active', (tab === 'vote' && i === 0) || (tab === 'aggregate' && i === 1));
      });
      document.getElementById('vote-view').classList.toggle('hidden', tab !== 'vote');
      document.getElementById('aggregate-view').classList.toggle('hidden', tab !== 'aggregate');
    }

    // Init
    buildTable();
