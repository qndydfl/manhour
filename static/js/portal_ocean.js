(() => {
    const slides = [...document.querySelectorAll("[data-ocean-slide]")];
    if (slides.length < 2) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = 0;
    let next = 0;
    let switching = false;

    window.setInterval(async () => {
        if (document.hidden || reducedMotion.matches || switching) return;
        next = (next + 1) % slides.length;
        if (next === active) return;
        const slide = slides[next];
        switching = true;
        try {
            if (!slide.hasAttribute("src")) slide.src = slide.dataset.src;
            await slide.decode();
            if (document.hidden || reducedMotion.matches) return;
            slides[active].classList.remove("is-active");
            slide.classList.add("is-active");
            active = next;
        } catch {
            // Keep the current background if this image cannot be loaded.
        } finally {
            switching = false;
        }
    }, 8000);
})();
