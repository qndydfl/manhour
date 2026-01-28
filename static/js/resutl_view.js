document.addEventListener("DOMContentLoaded", () => {
  const els = document.querySelectorAll(".fade-up");
  els.forEach((el, idx) => {
    setTimeout(() => el.classList.add("is-visible"), 60 * idx);
  });
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".card.border-danger").forEach((card) => {
    card.classList.add("pulse-danger");
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const q = document.getElementById("tableSearch");
  if (!q) return;

  q.addEventListener("input", () => {
    const keyword = q.value.trim().toLowerCase();
    document.querySelectorAll("tbody tr").forEach((tr) => {
      const text = tr.innerText.toLowerCase();
      tr.style.display = text.includes(keyword) ? "" : "none";
    });
  });
});
