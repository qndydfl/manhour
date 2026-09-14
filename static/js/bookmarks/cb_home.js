document.addEventListener("DOMContentLoaded", () => {
    const panel = document.getElementById("cbAircraftSettingsPanel");
    if (!panel) return;

    const select = document.getElementById("cbAircraftManageSelect");
    const code = document.getElementById("cbAircraftCode");
    const status = document.getElementById("cbAircraftStatus");
    const csrfToken = panel.querySelector("[name=csrfmiddlewaretoken]")?.value || "";

    function showStatus(message, type = "") {
        status.textContent = message;
        status.className = "cb-aircraft-settings-status" + (type ? ` is-${type}` : "");
    }

    function replaceOptions(models, selectedCode = "") {
        select.replaceChildren(...models.map((item) => new Option(item, item)));
        select.value = models.includes(selectedCode) ? selectedCode : models[0] || "";
        code.value = select.value;
    }

    async function refresh(selectedCode = "") {
        const response = await fetch(panel.dataset.apiUrl);
        if (!response.ok || response.redirected) throw new Error("기종 목록을 불러오지 못했습니다.");
        const data = await response.json();
        replaceOptions(data.aircraft_models || [], selectedCode);
    }

    async function changeAircraft(action) {
        const oldCode = select.value;
        const newCode = code.value.trim().toUpperCase();
        if (!newCode && action !== "delete") {
            showStatus("기종 이름을 입력해 주세요.", "error");
            code.focus();
            return;
        }
        if (action === "rename" && oldCode === newCode) {
            showStatus("변경할 기종 이름을 입력해 주세요.", "error");
            return;
        }
        if (action === "delete") {
            const confirmed = await window.AppDialog.confirm(
                `${oldCode} 기종을 삭제하시겠습니까? 이 기종에 저장된 템플릿도 모두 삭제됩니다.`,
                { title: "기종 삭제", variant: "danger", confirmText: "기종 삭제" },
            );
            if (!confirmed) return;
        }
        try {
            const response = await fetch(panel.dataset.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
                body: JSON.stringify({ action, old_code: oldCode, code: newCode, new_code: newCode }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "기종 변경에 실패했습니다.");
            const selectedCode = action === "delete" ? "" : data.code;
            await refresh(selectedCode);
            showStatus(
                action === "create"
                    ? `${data.code} 기종을 추가했습니다.`
                    : action === "rename"
                        ? `${oldCode} 기종을 ${data.code}(으)로 변경했습니다.`
                        : `${oldCode} 기종과 관련 템플릿을 삭제했습니다.`,
                "success",
            );
        } catch (error) {
            showStatus(error.message, "error");
        }
    }

    select.addEventListener("change", () => {
        code.value = select.value;
        showStatus("");
    });
    document.getElementById("cbAircraftAdd")?.addEventListener("click", () => changeAircraft("create"));
    document.getElementById("cbAircraftRename")?.addEventListener("click", () => changeAircraft("rename"));
    document.getElementById("cbAircraftDelete")?.addEventListener("click", () => changeAircraft("delete"));
});
