document.addEventListener("DOMContentLoaded", () => {
    const newWorkerInput = document.getElementById("newWorkerName");
    const addBtn = document.getElementById("addNewWorkerBtn");
    const listContainer = document.getElementById("workerListContainer");
    const confirmBtn = document.getElementById("confirmManningBtn");
    const editAreaForm = document.getElementById("editAreaForm");

    // 1. 새 작업자 항목 추가 로직
    function appendWorkerItem(name) {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        const hasDuplicate = Array.from(
            listContainer.querySelectorAll(".worker-chk"),
        ).some((chk) => chk.value === trimmedName);

        if (hasDuplicate) {
            newWorkerInput.value = "";
            newWorkerInput.focus();
            return;
        }

        const uniqueId = "new_" + Date.now();
        const html = `
            <div class="col-md-4 worker-item">
                <input type="checkbox" class="btn-check worker-chk" id="${uniqueId}" value="${trimmedName}" checked>
                <label class="btn btn-outline-primary text-dark bg-light w-100 rounded-3 text-start p-2 border-primary" for="${uniqueId}">
                    ${trimmedName} 
                </label>
            </div>
        `;
        listContainer.insertAdjacentHTML("afterbegin", html);
        newWorkerInput.value = "";
        newWorkerInput.focus();
    }

    if (addBtn)
        addBtn.addEventListener("click", () =>
            appendWorkerItem(newWorkerInput.value),
        );
    if (newWorkerInput) {
        newWorkerInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                appendWorkerItem(newWorkerInput.value);
            }
        });
    }

    // 2. 일괄 매닝 등록 (Fetch API)
    if (confirmBtn) {
        confirmBtn.addEventListener("click", function () {
            const areaId = document.getElementById("targetArea").value;
            const selectedWorkers = Array.from(
                document.querySelectorAll(".worker-chk:checked"),
            ).map((chk) => chk.value);

            if (!areaId) return alert("대상 구역을 선택해주세요.");
            if (selectedWorkers.length === 0)
                return alert("최소 한 명 이상의 작업자를 선택해주세요.");

            fetch(MANNING_CONFIG.batchManningUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": MANNING_CONFIG.csrfToken,
                },
                body: JSON.stringify({
                    area_id: areaId,
                    worker_names: selectedWorkers,
                }),
            })
                .then((response) => response.json())
                .then((data) => {
                    if (data.status === "success") location.reload();
                    else alert("등록 중 오류가 발생했습니다.");
                });
        });
    }
});

// 3. 구역 수정 모달 오픈 함수 (전역 함수로 유지)
window.openEditAreaModal = function (id, name, position) {
    const editModal = new bootstrap.Modal(
        document.getElementById("editAreaModal"),
    );
    document.getElementById("editAreaName").value = name;
    document.getElementById("editAreaPosition").value = position;

    // 폼 action 경로 동적 할당
    document.getElementById("editAreaForm").action =
        `${MANNING_CONFIG.updateAreaUrlPrefix}${id}/update/`;

    editModal.show();
};

document.addEventListener("DOMContentLoaded", () => {
    // 1. 구역 이름 자동 저장 (Blur 이벤트)
    document.querySelectorAll(".editable-area-name").forEach((el) => {
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                el.blur();
            }
        });

        el.addEventListener("blur", function () {
            const areaId = this.dataset.areaId;
            const newName = this.innerText.trim();

            fetch(`${MANNING_CONFIG.updateAreaUrlPrefix}${areaId}/update/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-CSRFToken": MANNING_CONFIG.csrfToken,
                },
                body: new URLSearchParams({ name: newName }),
            }).then((res) => {
                if (res.ok) showFeedback(el);
            });
        });
    });

    // 2. 작업 시간 자동 저장 (Change 이벤트)
    document.querySelectorAll(".hour-input").forEach((input) => {
        input.addEventListener("change", function () {
            const manningId = this.dataset.manningId;
            const hours = this.value;

            fetch(
                `${MANNING_CONFIG.updateManningUrlPrefix}${manningId}/update-hours/`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "X-CSRFToken": MANNING_CONFIG.csrfToken,
                    },
                    body: new URLSearchParams({ hours: hours }),
                },
            ).then((res) => {
                if (res.ok) showFeedback(this.parentElement);
            });
        });
    });

    // 시각적 피드백 함수
    function showFeedback(element) {
        element.style.transition = "all 0.3s";
        element.style.backgroundColor = "#e8f5e9"; // 아주 연한 초록색
        setTimeout(() => {
            element.style.backgroundColor = "";
        }, 500);
    }
});
