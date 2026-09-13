export function clearElement(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function appendInfoRow(container, label, value, valueId = null) {
  if (!container) return;
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  const span = document.createElement("span");
  span.textContent = value ?? "--";
  if (valueId) span.id = valueId;
  p.appendChild(strong);
  p.appendChild(document.createTextNode(" "));
  p.appendChild(span);
  container.appendChild(p);
}

export function renderInfoSection(container, rows) {
  clearElement(container);
  rows.forEach(({ label, value, valueId }) => appendInfoRow(container, label, value, valueId));
}

export function formatFiniteNumber(value, maximumFractionDigits = 2, minimumFractionDigits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toLocaleString("en-US", { maximumFractionDigits, minimumFractionDigits });
}

export function formatAstronomicalUnits(value) {
  const text = formatFiniteNumber(value, 4, 4);
  return text === "—" ? text : `${text} AU`;
}

export function populateParagraphList(container, items) {
  clearElement(container);
  items.forEach((text) => {
    const p = document.createElement("p");
    p.textContent = text;
    container.appendChild(p);
  });
}
export function formatMeasurement(value, unit, digits = 2) {
  const text = formatFiniteNumber(value, digits);
  return text === "—" ? text : `${text} ${unit}`;
}
