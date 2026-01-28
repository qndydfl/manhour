document.addEventListener("DOMContentLoaded", () => {
  const formAction = document.getElementById("formAction");
  const saveBtn = document.getElementById("saveAllBtn");
  const deleteBtn = document.getElementById("deleteSelectedBtn");

  // 필수 요소 없으면 조용히 종료(페이지별 공용 JS일 때 안전)
  if (!formAction) return;

  if (saveBtn) {
    saveBtn.addEventListener("click", function (e) {
      e.preventDefault(); // 기본 submit 방지(버튼 type=submit 대비)
      formAction.value = "save";
      const form = this.closest("form");
      if (form) form.submit();
      else console.error("❌ saveAllBtn이 속한 form을 찾을 수 없습니다.");
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!confirm("선택된 항목을 삭제하시겠습니까?")) return;
      formAction.value = "delete";
      const form = this.closest("form");
      if (form) form.submit();
      else console.error("❌ deleteSelectedBtn이 속한 form을 찾을 수 없습니다.");
    });
  }
});
