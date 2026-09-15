document.addEventListener(
    "DOMContentLoaded",
    () => {

        const library =
            document.getElementById(
                "cbTemplateLibrary",
            );


        if (!library) {
            return;
        }


        const cards =
            Array.from(
                document.querySelectorAll(
                    "[data-aircraft-card]",
                ),
            );


        const dataRoot =
            document.getElementById(
                "cbTemplateLibraryData",
            );


        const panel =
            document.getElementById(
                "cbTemplateResultPanel",
            );


        const pointer =
            document.getElementById(
                "cbTemplatePanelPointer",
            );


        const title =
            document.getElementById(
                "cbSelectedAircraftTitle",
            );


        const count =
            document.getElementById(
                "cbSelectedTemplateCount",
            );


        const list =
            document.getElementById(
                "cbSelectedTemplateList",
            );


        const empty =
            document.getElementById(
                "cbSelectedTemplateEmpty",
            );


        const newButton =
            document.getElementById(
                "cbNewTemplateButton",
            );


        const search =
            document.getElementById(
                "cbTemplateAircraftSearch",
            );


        const clearSearch =
            document.getElementById(
                "cbTemplateSearchClear",
            );


        const searchEmpty =
            document.getElementById(
                "cbAircraftSearchEmpty",
            );


        let selectedAircraft =
            "";


        /* =================================================
           MANAGE URL
        ================================================= */

        const manageBaseUrl =
            newButton?.getAttribute(
                "href",
            ) || "";


        /* =================================================
           DATA
        ================================================= */

        function getAircraftTemplates(
            aircraft,
        ) {

            const group =
                Array.from(
                    dataRoot?.children || [],
                ).find(
                    (element) =>
                        element.dataset.aircraftGroup ===
                        aircraft,
                );


            if (!group) {
                return [];
            }


            return Array.from(
                group.querySelectorAll(
                    "[data-template-item]",
                ),
            ).map(
                (element) => ({
                    id:
                        element.dataset.id,

                    name:
                        element.dataset.name,

                    created:
                        element.dataset.created,

                    manageUrl:
                        element.dataset.manageUrl,
                }),
            );
        }


        /* =================================================
           URL
        ================================================= */

        function makeManageUrl(
            aircraft,
            templateId = "",
        ) {

            const url =
                new URL(
                    manageBaseUrl,
                    window.location.origin,
                );


            url.searchParams.set(
                "aircraft_model",
                aircraft,
            );


            if (templateId) {

                url.searchParams.set(
                    "template_id",
                    templateId,
                );

            }


            return url.toString();
        }


        /* =================================================
           TEMPLATE ITEM
        ================================================= */

        function createTemplateItem(
            aircraft,
            item,
        ) {

            const wrapper =
                document.createElement(
                    "article",
                );


            wrapper.className =
                "cb-template-item";


            /* icon */

            const icon =
                document.createElement(
                    "span",
                );


            icon.className =
                "cb-template-item-icon";


            icon.innerHTML =
                '<i class="bi bi-file-earmark-text"></i>';


            /* copy */

            const copy =
                document.createElement(
                    "div",
                );


            copy.className =
                "cb-template-item-copy";


            const name =
                document.createElement(
                    "strong",
                );


            name.textContent =
                item.name;


            const date =
                document.createElement(
                    "small",
                );


            date.textContent =
                item.created
                    ? `생성 ${item.created}`
                    : "저장된 템플릿";


            copy.append(
                name,
                date,
            );


            /* actions */

            const actions =
                document.createElement(
                    "div",
                );


            actions.className =
                "cb-template-item-actions";


            const edit =
                document.createElement(
                    "a",
                );


            edit.className =
                "cb-template-item-edit";


            edit.href = item.manageUrl || makeManageUrl(aircraft, item.id);


            edit.textContent =
                "수정";


            const open =
                document.createElement(
                    "a",
                );


            open.className =
                "cb-template-item-open";


            open.href = item.manageUrl || makeManageUrl(aircraft, item.id);


            open.innerHTML =
                '<i class="bi bi-chevron-right"></i>';


            open.setAttribute(
                "aria-label",
                `${item.name} 열기`,
            );


            actions.append(
                edit,
                open,
            );


            wrapper.append(
                icon,
                copy,
                actions,
            );


            return wrapper;
        }


        /* =================================================
           POINTER POSITION
        ================================================= */

        function movePointer(
            card,
        ) {

            if (
                !pointer ||
                !panel ||
                !card
            ) {
                return;
            }


            const panelRect =
                panel.getBoundingClientRect();


            const cardRect =
                card.getBoundingClientRect();


            const center =
                cardRect.left +
                cardRect.width / 2 -
                panelRect.left;


            const position =
                Math.max(
                    20,
                    Math.min(
                        panelRect.width - 38,
                        center - 9,
                    ),
                );


            pointer.style.left =
                `${position}px`;
        }


        /* =================================================
           SELECT AIRCRAFT
        ================================================= */

        function selectAircraft(
            card,
            scrollToPanel = false,
        ) {

            const aircraft =
                card.dataset.aircraft;


            /*
             * 같은 카드 다시 클릭
             * → 닫기
             */
            if (
                selectedAircraft ===
                aircraft &&
                !panel.hidden
            ) {

                selectedAircraft =
                    "";


                panel.hidden =
                    true;


                cards.forEach(
                    (item) => {

                        item.classList.remove(
                            "is-active",
                        );


                        item.setAttribute(
                            "aria-expanded",
                            "false",
                        );

                    },
                );


                return;
            }


            selectedAircraft =
                aircraft;


            cards.forEach(
                (item) => {

                    const active =
                        item === card;


                    item.classList.toggle(
                        "is-active",
                        active,
                    );


                    item.setAttribute(
                        "aria-expanded",
                        String(active),
                    );

                },
            );


            const templates =
                getAircraftTemplates(
                    aircraft,
                );


            title.textContent =
                `${aircraft} 템플릿 목록`;


            count.textContent =
                `${templates.length}개`;


            newButton.href =
                makeManageUrl(
                    aircraft,
                );


            list.replaceChildren();


            templates.forEach(
                (item) => {

                    list.appendChild(
                        createTemplateItem(
                            aircraft,
                            item,
                        ),
                    );

                },
            );


            const hasTemplates =
                templates.length > 0;


            list.hidden =
                !hasTemplates;


            empty.hidden =
                hasTemplates;


            panel.hidden =
                false;


            window.requestAnimationFrame(
                () => {

                    movePointer(
                        card,
                    );


                    if (
                        scrollToPanel
                    ) {

                        panel.scrollIntoView({
                            behavior:
                                "smooth",

                            block:
                                "nearest",
                        });

                    }

                },
            );
        }


        /* =================================================
           CARD EVENTS
        ================================================= */

        cards.forEach(
            (card) => {

                card.addEventListener(
                    "click",
                    () => {

                        if (card.matches("a[href]")) {
                            return;
                        }

                        selectAircraft(
                            card,
                            true,
                        );

                    },
                );

            },
        );


        /* =================================================
           SEARCH
        ================================================= */

        function applySearch() {

            const query =
                String(
                    search?.value ||
                        "",
                )
                    .trim()
                    .toUpperCase();


            let visibleCount =
                0;


            cards.forEach(
                (card) => {

                    const aircraft =
                        card.dataset.aircraft
                            .toUpperCase();


                    const visible =
                        !query ||
                        aircraft.includes(
                            query,
                        );


                    card.classList.toggle(
                        "is-search-hidden",
                        !visible,
                    );


                    if (visible) {
                        visibleCount += 1;
                    }

                },
            );


            if (clearSearch) {

                clearSearch.hidden =
                    !query;

            }


            if (searchEmpty) {

                searchEmpty.hidden =
                    visibleCount !== 0;

            }

        }


        search?.addEventListener(
            "input",
            applySearch,
        );


        clearSearch?.addEventListener(
            "click",
            () => {

                search.value =
                    "";


                applySearch();


                search.focus();

            },
        );


        /* =================================================
           RESIZE
        ================================================= */

        window.addEventListener(
            "resize",
            () => {

                if (
                    !selectedAircraft ||
                    panel.hidden
                ) {
                    return;
                }


                const active =
                    document.querySelector(
                        "[data-aircraft-card].is-active",
                    );


                movePointer(
                    active,
                );

            },
        );

    },
);
