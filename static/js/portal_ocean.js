(() => {
    const background = document.querySelector(".index-background");
    if (!background) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 700px)");
    const video = background.querySelector(".portal-ocean-video");
    if (video) {
        const showVideo = (show) =>
            background.classList.toggle("is-video-playing", show);
        video.addEventListener("playing", () => showVideo(true));
        for (const event of ["pause", "ended", "error", "emptied"]) {
            video.addEventListener(event, () => showVideo(false));
        }

        const syncPlayback = () => {
            if (mobile.matches || reducedMotion.matches) {
                video.pause();
                showVideo(false);
                return;
            }
            video.play().catch(() => showVideo(false));
        };
        mobile.addEventListener("change", syncPlayback);
        reducedMotion.addEventListener("change", syncPlayback);
        syncPlayback();
    }

    const slides = [...background.querySelectorAll("[data-ocean-slide]")];
    if (slides.length < 2) return;

    let active = 0;
    let next = 0;
    let switching = false;

    window.setInterval(async () => {
        if (
            document.hidden ||
            reducedMotion.matches ||
            switching ||
            background.classList.contains("is-video-playing")
        )
            return;
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
