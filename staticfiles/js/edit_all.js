document
  .getElementById("saveAllBtn")
  .addEventListener("click", function () {
      document.getElementById("formAction").value = "save";
      this.closest("form").submit();
  });

document
  .getElementById("deleteSelectedBtn")
  .addEventListener("click", function () {
      if (!confirm("선택된 항목을 삭제하시겠습니까?")) return;
      document.getElementById("formAction").value = "delete";
      this.closest("form").submit();
  });