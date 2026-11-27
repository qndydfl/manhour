(() => {
    const field = document.getElementById("login-team-field");
    const team = document.getElementById("login-team");
    const group = document.getElementById("login-workplace");
    if (!field || !team || !group) return;

    const groups = Array.from(group.options).filter((option) => option.value);
    const initialGroup = group.value;
    team.value = group.selectedOptions[0]?.dataset.team ??
        (team.options.length === 2 ? team.options[1].value : "");

    function syncGroups(selection = "") {
        group.replaceChildren(new Option("그룹 선택", ""));
        groups.filter((option) => option.dataset.team === team.value)
            .forEach((option) => group.append(option));
        group.value = selection;
        if (group.selectedIndex < 0) group.value = "";
        group.disabled = !team.value;
    }

    field.hidden = false;
    team.disabled = false;
    team.required = true;
    syncGroups(initialGroup);
    team.addEventListener("change", () => syncGroups());
})();
