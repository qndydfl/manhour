document.addEventListener(
    "DOMContentLoaded",
    function () {

        const loader =
            document.getElementById(
                "common-loader"
            );

        const title =
            document.getElementById(
                "loader-title"
            );

        const text =
            document.getElementById(
                "loader-text"
            );


        if (!loader) {
            return;
        }


        function showLoader(
            loaderTitle,
            loaderText
        ) {

            if (title) {
                title.textContent =
                    loaderTitle ||
                    "Processing";
            }

            if (text) {
                text.textContent =
                    loaderText ||
                    "잠시만 기다려 주세요.";
            }

            loader.hidden = false;
        }


        function hideLoader() {

            loader.hidden = true;

        }


        window.showV2Loader =
            showLoader;

        window.hideV2Loader =
            hideLoader;


        window.addEventListener(
            "pageshow",
            hideLoader
        );


        document
            .querySelectorAll(
                "form[data-loading]"
            )
            .forEach(
                function (form) {

                    form.addEventListener(
                        "submit",
                        function () {

                            if (
                                typeof form.checkValidity ===
                                "function" &&
                                !form.checkValidity()
                            ) {
                                return;
                            }


                            showLoader(
                                form.dataset.loadingTitle,
                                form.dataset.loadingText
                            );

                        }
                    );

                }
            );


        document
            .querySelectorAll(
                "a[data-loading]"
            )
            .forEach(
                function (link) {

                    link.addEventListener(
                        "click",
                        function (event) {

                            const href =
                                link.getAttribute(
                                    "href"
                                );


                            if (
                                !href ||
                                href.startsWith("#") ||
                                link.target === "_blank" ||
                                link.hasAttribute("download") ||
                                event.ctrlKey ||
                                event.metaKey ||
                                event.shiftKey
                            ) {
                                return;
                            }


                            showLoader(
                                link.dataset.loadingTitle,
                                link.dataset.loadingText
                            );

                        }
                    );

                }
            );

    }
);