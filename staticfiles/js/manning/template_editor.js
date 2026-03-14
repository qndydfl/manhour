(function () {
    "use strict";

    function getLines(value) {
        return (value || "")
            .split("\n")
            .map(function (line) {
                return line.trim();
            })
            .filter(function (line) {
                return line.length > 0;
            });
    }

    function buildItem(label) {
        var item = document.createElement("div");
        item.className = "dnd-item";
        item.draggable = true;

        var text = document.createElement("span");
        text.className = "dnd-label";
        text.textContent = label;

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "dnd-remove";
        remove.textContent = "x";

        item.appendChild(text);
        item.appendChild(remove);
        return item;
    }

    function getDragAfterElement(container, y) {
        var items = Array.prototype.slice
            .call(container.querySelectorAll(".dnd-item:not(.is-dragging)"))
            .map(function (element) {
                var box = element.getBoundingClientRect();
                return {
                    element: element,
                    offset: y - box.top - box.height / 2,
                };
            })
            .filter(function (entry) {
                return entry.offset < 0;
            })
            .sort(function (a, b) {
                return a.offset - b.offset;
            });

        return items.length ? items[0].element : null;
    }

    function syncTextareasFromLists(block) {
        var lists = block.querySelectorAll(".dnd-list");
        lists.forEach(function (list) {
            var position = list.getAttribute("data-position");
            var textarea = block.querySelector(
                '.template-items[data-position="' + position + '"]',
            );
            if (!textarea) {
                return;
            }
            var labels = Array.prototype.slice
                .call(list.querySelectorAll(".dnd-label"))
                .map(function (label) {
                    return label.textContent.trim();
                })
                .filter(function (label) {
                    return label.length > 0;
                });
            textarea.value = labels.join("\n");
            updateEmptyState(list);
        });
        updateDuplicates(block);
    }

    function updateDuplicates(block) {
        var seen = {};
        var items = block.querySelectorAll(".dnd-item");
        var warning = block.querySelector(".dnd-warning");
        items.forEach(function (item) {
            item.classList.remove("is-duplicate");
        });

        items.forEach(function (item) {
            var label = item.querySelector(".dnd-label");
            var name = label ? label.textContent.trim().toLowerCase() : "";
            if (!name) {
                return;
            }
            if (!seen[name]) {
                seen[name] = [];
            }
            seen[name].push(item);
        });

        var duplicateNames = [];
        Object.keys(seen).forEach(function (key) {
            if (seen[key].length > 1) {
                duplicateNames.push(key);
                seen[key].forEach(function (item) {
                    item.classList.add("is-duplicate");
                });
            }
        });

        if (warning) {
            if (duplicateNames.length > 0) {
                warning.textContent =
                    "중복 항목이 " + duplicateNames.length + "개 있습니다.";
                warning.classList.add("is-visible");
            } else {
                warning.textContent = "";
                warning.classList.remove("is-visible");
            }
        }
    }

    function updateEmptyState(list) {
        var empty = list.querySelector(".dnd-empty");
        var hasItems = list.querySelectorAll(".dnd-item").length > 0;
        if (!hasItems && !empty) {
            empty = document.createElement("div");
            empty.className = "dnd-empty";
            empty.textContent = "항목 없음";
            list.appendChild(empty);
        } else if (hasItems && empty) {
            empty.remove();
        }
    }

    function buildListsFromTextareas(block) {
        var lists = block.querySelectorAll(".dnd-list");
        lists.forEach(function (list) {
            list.innerHTML = "";
        });

        var textareas = block.querySelectorAll(".template-items");
        textareas.forEach(function (textarea) {
            var position = textarea.getAttribute("data-position");
            var list = block.querySelector(
                '.dnd-list[data-position="' + position + '"]',
            );
            if (!list) {
                return;
            }
            getLines(textarea.value).forEach(function (label) {
                list.appendChild(buildItem(label));
            });
            updateEmptyState(list);
        });
        updateDuplicates(block);
    }

    function wireDragAndDrop(block) {
        var dragged = null;

        function addItemFromInput(input) {
            var value = (input.value || "").trim();
            if (!value) {
                return;
            }
            var column = input.closest(".col-md-4");
            var list = column ? column.querySelector(".dnd-list") : null;
            if (!list) {
                return;
            }
            list.appendChild(buildItem(value));
            input.value = "";
            syncTextareasFromLists(block);
            input.focus();
        }

        block.addEventListener("click", function (event) {
            var target = event.target;
            if (target.classList.contains("dnd-remove")) {
                var item = target.closest(".dnd-item");
                if (item) {
                    var label = item.querySelector(".dnd-label");
                    var name = label ? label.textContent.trim() : "";
                    var message = name
                        ? '"' + name + '" 항목을 삭제할까요?'
                        : "이 항목을 삭제할까요?";
                    if (!window.confirm(message)) {
                        return;
                    }
                    item.remove();
                    syncTextareasFromLists(block);
                }
            }
            if (target.classList.contains("dnd-btn")) {
                var input = target
                    .closest(".dnd-add")
                    .querySelector(".dnd-input");
                if (input) {
                    addItemFromInput(input);
                }
            }
        });

        block.addEventListener("change", function (event) {
            var target = event.target;
            if (
                target.matches('input[name="template_delete"]') &&
                target.checked
            ) {
                if (!window.confirm("이 템플릿을 삭제할까요?")) {
                    target.checked = false;
                }
            }
        });

        block.addEventListener("keydown", function (event) {
            if (
                event.key === "Enter" &&
                event.target.classList.contains("dnd-input")
            ) {
                event.preventDefault();
                addItemFromInput(event.target);
            }
        });

        block.addEventListener("dragstart", function (event) {
            var item = event.target.closest(".dnd-item");
            if (!item) {
                return;
            }
            dragged = item;
            item.classList.add("is-dragging");
            event.dataTransfer.effectAllowed = "move";
        });

        block.addEventListener("dragend", function (event) {
            var item = event.target.closest(".dnd-item");
            if (item) {
                item.classList.remove("is-dragging");
            }
            dragged = null;
            syncTextareasFromLists(block);
        });

        block.querySelectorAll(".dnd-list").forEach(function (list) {
            list.addEventListener("dragover", function (event) {
                event.preventDefault();
                list.classList.add("is-over");
                if (!dragged) {
                    return;
                }
                var after = getDragAfterElement(list, event.clientY);
                if (after === null) {
                    list.appendChild(dragged);
                } else {
                    list.insertBefore(dragged, after);
                }
            });

            list.addEventListener("dragleave", function () {
                list.classList.remove("is-over");
            });

            list.addEventListener("drop", function (event) {
                event.preventDefault();
                list.classList.remove("is-over");
                syncTextareasFromLists(block);
            });

            updateEmptyState(list);
        });

        block.querySelectorAll(".template-items").forEach(function (textarea) {
            textarea.addEventListener("change", function () {
                buildListsFromTextareas(block);
            });
            textarea.addEventListener("blur", function () {
                buildListsFromTextareas(block);
            });
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll(".template-block").forEach(function (block) {
            buildListsFromTextareas(block);
            wireDragAndDrop(block);
        });
    });
})();
