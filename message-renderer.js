(function () {
  "use strict";

  function cleanFormatting(value) {
    let text = String(value ?? "");
    text = text
      .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, "$1")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
      .replace(/\{,\}/g, ",")
      .replace(/\\(?:times|cdot)/g, "x")
      .replace(/\\approx/g, "≈")
      .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, "$1")
      .replace(/\^2\b/g, "²");
    for (let pass = 0; pass < 3; pass += 1) {
      text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)");
    }
    return text
      .replace(/\\(?:left|right)\b/g, "")
      .replace(/\\([a-zA-Z]+)\b/g, "$1")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function tableCells(line) {
    return String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
  }

  function isTableDivider(line) {
    const cells = tableCells(line);
    return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  function appendSafeRichText(container, value) {
    const lines = cleanFormatting(value).split("\n");
    let plainLines = [];
    const flushPlainText = () => {
      if (!plainLines.length) return;
      const block = document.createElement("div");
      block.className = "message-text-block";
      block.textContent = plainLines.join("\n").trim();
      if (block.textContent) container.append(block);
      plainLines = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
      const header = tableCells(lines[index]);
      const beginsTable = lines[index].includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]);
      if (!beginsTable || header.length < 2) {
        plainLines.push(lines[index]);
        continue;
      }

      flushPlainText();
      const tableWrap = document.createElement("div");
      tableWrap.className = "bot-table-wrap";
      tableWrap.setAttribute("role", "region");
      tableWrap.setAttribute("aria-label", "Scrollable comparison table");
      tableWrap.tabIndex = 0;
      const table = document.createElement("table");
      table.className = "bot-table";
      const thead = document.createElement("thead");
      const headingRow = document.createElement("tr");
      header.forEach(label => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        headingRow.append(th);
      });
      thead.append(headingRow);
      table.append(thead);

      const tbody = document.createElement("tbody");
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        const cells = tableCells(lines[index]);
        if (cells.length !== header.length || isTableDivider(lines[index])) break;
        const row = document.createElement("tr");
        cells.forEach(cellText => {
          const td = document.createElement("td");
          td.textContent = cellText;
          row.append(td);
        });
        tbody.append(row);
        index += 1;
      }
      index -= 1;
      table.append(tbody);
      tableWrap.append(table);
      container.append(tableWrap);
    }
    flushPlainText();
  }

  function appendMessageContent(bubble, text, media, quality, isBot, handlers = {}) {
    const body = document.createElement("div");
    body.className = "message-text";
    if (isBot) appendSafeRichText(body, text);
    else body.textContent = text;
    bubble.append(body);

    const mediaItems = Array.isArray(media) ? media : media?.src ? [media] : [];
    mediaItems.forEach(mediaItem => {
      const figure = document.createElement("figure");
      figure.className = "message-media";
      const link = document.createElement("a");
      link.href = mediaItem.src;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = mediaItem.openLabel || "Open larger image";
      const image = document.createElement("img");
      image.src = mediaItem.src;
      image.alt = mediaItem.alt || "Fitness exercise reference";
      image.loading = "lazy";
      link.append(image);
      figure.append(link);
      if (mediaItem.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = mediaItem.caption;
        figure.append(caption);
      }
      bubble.append(figure);
    });

    if (!quality) return;
    const panel = document.createElement("div");
    panel.className = "answer-quality";
    const provenance = document.createElement("div");
    provenance.className = "answer-provenance";
    provenance.textContent = `${quality.source} · confiança ${quality.confidence}`;
    panel.append(provenance);
    if (quality.followUp) {
      const followUp = document.createElement("button");
      followUp.type = "button";
      followUp.className = "answer-followup";
      followUp.textContent = quality.followUp;
      followUp.addEventListener("click", () => handlers.onFollowUp?.(quality.followUp, quality.followUpAction));
      panel.append(followUp);
    }
    const feedback = document.createElement("div");
    feedback.className = "answer-feedback";
    feedback.setAttribute("aria-label", "Avalie esta resposta");
    [["up", "Útil", "👍"], ["down", "Não foi útil", "👎"]].forEach(([value, label, icon]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.rating = value;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.textContent = icon;
      button.addEventListener("click", () => {
        handlers.onRate?.(quality, value);
        feedback.querySelectorAll("button").forEach(item => item.classList.toggle("selected", item === button));
      });
      feedback.append(button);
    });
    panel.append(feedback);
    bubble.append(panel);
  }

  window.FitnessMessageRenderer = { cleanFormatting, appendSafeRichText, appendMessageContent };
})();
