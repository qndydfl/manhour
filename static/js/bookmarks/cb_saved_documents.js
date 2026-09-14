document.addEventListener("DOMContentLoaded", () => {
    /* =====================================================
       ELEMENTS
       ===================================================== */

    const page = document.getElementById("cbSavedDocuments");

    if (!page) {
        return;
    }

    const list = document.getElementById("cbSavedDocumentList");
    const empty = document.getElementById("cbSavedEmpty");

    /* =====================================================
       STORAGE KEY
       ===================================================== */

    const SAVED_DOCUMENTS_KEY = "cb_open_list_saved_documents_v1";

    const WORKSPACE_KEY = "cb_open_list_workspace_v1";

    /* =====================================================
       DISPLAY LIMIT

       기종에 관계없이 최근 저장 문서 최대 10개
       ===================================================== */

    const MAX_VISIBLE_DOCUMENTS = 10;

    /* =====================================================
       LOAD SAVED DOCUMENTS
       ===================================================== */

    function loadSavedDocuments() {
        try {
            const raw = localStorage.getItem(SAVED_DOCUMENTS_KEY);

            if (!raw) {
                return [];
            }

            const documents = JSON.parse(raw);

            if (!Array.isArray(documents)) {
                return [];
            }

            return documents;
        } catch (error) {
            console.error("저장된 C/B 문서를 불러오지 못했습니다.", error);

            return [];
        }
    }

    /* =====================================================
       SAVE DOCUMENT LIST
       ===================================================== */

    function saveDocumentList(documents) {
        try {
            localStorage.setItem(
                SAVED_DOCUMENTS_KEY,
                JSON.stringify(documents),
            );

            return true;
        } catch (error) {
            console.error("C/B 문서 목록 저장 실패", error);

            return false;
        }
    }

    /* =====================================================
       DATE FORMAT
       ===================================================== */

    function formatSavedDate(value) {
        if (!value) {
            return "저장 시간 정보 없음";
        }

        const date = new Date(value);

        if (Number.isNaN(date.valueOf())) {
            return "저장 시간 정보 없음";
        }

        return `저장: ${date.toLocaleString("ko-KR")}`;
    }

    /* =====================================================
       EMPTY STATE
       ===================================================== */

    function showEmptyState() {
        if (list) {
            list.hidden = true;
            list.replaceChildren();
        }

        if (empty) {
            empty.hidden = false;
        }
    }

    /* =====================================================
       DOCUMENT NAME
       ===================================================== */

    function getDocumentDisplayName(saved) {
        const info = saved?.document || {};

        const aircraft = info.aircraft || "";

        const gibun = info.gibun ? `HL${info.gibun}` : "";

        return (
            [aircraft, gibun].filter(Boolean).join(" · ") ||
            info.title ||
            "C/B 문서"
        );
    }

    /* =====================================================
       OPEN SAVED DOCUMENT
       ===================================================== */

    function openSavedDocument(saved) {
        try {
            /*
             * 선택한 저장 문서를 현재 Workspace로 복사
             */
            localStorage.setItem(WORKSPACE_KEY, JSON.stringify(saved));

            /*
             * C/B Open List로 이동
             */
            window.location.href = page.dataset.editorUrl;
        } catch (error) {
            console.error("저장 문서 열기 실패", error);

            if (
                window.AppDialog &&
                typeof window.AppDialog.alert === "function"
            ) {
                window.AppDialog.alert("저장된 C/B 문서를 열 수 없습니다.", {
                    title: "문서 열기",
                    variant: "warning",
                });
            } else {
                window.alert("저장된 C/B 문서를 열 수 없습니다.");
            }
        }
    }

    /* =====================================================
       DELETE SAVED DOCUMENT
       ===================================================== */

    async function deleteSavedDocument(index) {
        const documents = loadSavedDocuments();

        const saved = documents[index];

        if (!saved) {
            return;
        }

        const documentName = getDocumentDisplayName(saved);

        let confirmed = false;

        if (
            window.AppDialog &&
            typeof window.AppDialog.confirm === "function"
        ) {
            confirmed = await window.AppDialog.confirm(
                `${documentName} 저장 문서를 삭제하시겠습니까?`,
                {
                    title: "저장 문서 삭제",
                    variant: "danger",
                    confirmText: "삭제",
                    cancelText: "취소",
                },
            );
        } else {
            confirmed = window.confirm(
                `${documentName} 저장 문서를 삭제하시겠습니까?`,
            );
        }

        if (!confirmed) {
            return;
        }

        /*
         * 실제 전체 배열에서 해당 문서 삭제
         */
        documents.splice(index, 1);

        const savedSuccessfully = saveDocumentList(documents);

        if (!savedSuccessfully) {
            return;
        }

        /*
         * 화면 다시 생성
         */
        renderSavedDocuments();
    }

    /* =====================================================
       CREATE DOCUMENT CARD
       ===================================================== */

    function createDocumentCard(saved, originalIndex) {
        const info = saved.document || {};

        const aircraft = info.aircraft || "";

        const gibun = info.gibun ? `HL${info.gibun}` : "";

        const card = document.createElement("section");

        card.className = "cb-saved-card";

        /* =================================================
           ICON
           ================================================= */

        const icon = document.createElement("div");

        icon.className = "cb-saved-icon";

        icon.innerHTML = '<i class="bi bi-file-earmark-text"></i>';

        /* =================================================
           COPY
           ================================================= */

        const copy = document.createElement("div");

        copy.className = "cb-saved-copy";

        const title = document.createElement("strong");

        title.textContent = info.title || "CIRCUIT BREAKER OPEN LIST";

        const meta = document.createElement("span");

        meta.textContent =
            [aircraft, gibun].filter(Boolean).join(" · ") || "기종·기번 미입력";

        const time = document.createElement("small");

        time.textContent = formatSavedDate(saved.savedAt);

        copy.append(title, meta, time);

        /* =================================================
           ACTIONS
           ================================================= */

        const actions = document.createElement("div");

        actions.className = "cb-saved-actions";

        /*
         * 이어서 작성
         */
        const openButton = document.createElement("a");

        openButton.className = "btn btn-primary";

        openButton.href = page.dataset.editorUrl;

        openButton.innerHTML =
            '<i class="bi bi-pencil-square me-1"></i>이어서 작성';

        openButton.addEventListener("click", (event) => {
            event.preventDefault();

            openSavedDocument(saved);
        });

        /*
         * 삭제
         */
        const deleteButton = document.createElement("button");

        deleteButton.type = "button";

        deleteButton.className = "btn btn-outline-danger";

        deleteButton.innerHTML =
            '<i class="bi bi-trash me-1"></i>저장 문서 삭제';

        deleteButton.addEventListener("click", () => {
            deleteSavedDocument(originalIndex);
        });

        actions.append(openButton, deleteButton);

        /* =================================================
           CARD
           ================================================= */

        card.append(icon, copy, actions);

        return card;
    }

    /* =====================================================
       RENDER SAVED DOCUMENTS

       저장 목록:
       [0] 최신
       [1] 그 다음
       ...

       최대 10개까지만 화면 표시

       11번째 이후 문서는 localStorage에는 남아 있지만
       Saved Documents 화면에는 표시하지 않음
       ===================================================== */

    function renderSavedDocuments() {
        const documents = loadSavedDocuments();

        if (!documents.length) {
            showEmptyState();
            return;
        }

        if (!list) {
            return;
        }

        /*
         * 기존 카드 제거
         */
        list.replaceChildren();

        /*
         * 최신 최대 10개
         */
        const visibleDocuments = documents.slice(0, MAX_VISIBLE_DOCUMENTS);

        /*
         * 정상적인 저장 데이터만 카드 생성
         */
        visibleDocuments.forEach((saved, index) => {
            if (!saved || !saved.rows) {
                return;
            }

            const card = createDocumentCard(saved, index);

            list.appendChild(card);
        });

        /*
         * 표시 가능한 카드가 하나도 없는 경우
         */
        if (!list.children.length) {
            showEmptyState();
            return;
        }

        if (empty) {
            empty.hidden = true;
        }

        list.hidden = false;
    }

    /* =====================================================
       INITIALIZE
       ===================================================== */

    renderSavedDocuments();
});
