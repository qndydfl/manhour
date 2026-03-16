(function () {
    "use strict";

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function getLines(value) {
        return String(value || "")
            .split("\n")
            .map(function (line) {
                return normalizeText(line);
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
        remove.setAttribute("aria-label", "항목 삭제");
        remove.textContent = "×";

        item.appendChild(text);
        item.appendChild(remove);

        return item;
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

    function updateDuplicates(block) {
        var seen = {};
        var duplicateNames = [];
        var items = block.querySelectorAll(".dnd-item");
        var warning = block.querySelector(".dnd-warning");

        items.forEach(function (item) {
            item.classList.remove("is-duplicate");
        });

        items.forEach(function (item) {
            var label = item.querySelector(".dnd-label");
            var name = label ? normalizeText(label.textContent).toLowerCase() : "";

            if (!name) {
                return;
            }

            if (!seen[name]) {
                seen[name] = [];
            }
            seen[name].push(item);
        });

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
                    "중복 항목이 " + duplicateNames.length + "개 있습니다. 저장 전에 정리하세요.";
                warning.classList.add("is-visible");
            } else {
                warning.textContent = "";
                warning.classList.remove("is-visible");
            }
        }

        return duplicateNames.length === 0;
    }

    function syncTextareasFromLists(block) {
        var lists = block.querySelectorAll(".dnd-list");

        lists.forEach(function (list) {
            var position = list.getAttribute("data-position");
            var textarea = block.querySelector(
                '.template-items[data-position="' + position + '"]'
            );

            if (!textarea) {
                return;
            }

            var labels = Array.prototype.slice
                .call(list.querySelectorAll(".dnd-label"))
                .map(function (label) {
                    return normalizeText(label.textContent);
                })
                .filter(function (label) {
                    return label.length > 0;
                });

            textarea.value = labels.join("\n");
            updateEmptyState(list);
        });

        updateDuplicates(block);
    }

    function buildListsFromTextareas(block) {
        var lists = block.querySelectorAll(".dnd-list");
        var textareas = block.querySelectorAll(".template-items");

        lists.forEach(function (list) {
            list.innerHTML = "";
        });

        textareas.forEach(function (textarea) {
            var position = textarea.getAttribute("data-position");
            var list = block.querySelector(
                '.dnd-list[data-position="' + position + '"]'
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
                return b.offset - a.offset;
            });

        return items.length ? items[0].element : null;
    }

    function addItemToList(block, list, value) {
        var normalized = normalizeText(value);
        if (!normalized || !list) {
            return;
        }

        list.appendChild(buildItem(normalized));
        syncTextareasFromLists(block);
    }

    function wireDragAndDrop(block) {
        var dragged = null;

        block.addEventListener("click", function (event) {
            var target = event.target;

            if (target.classList.contains("dnd-remove")) {
                var item = target.closest(".dnd-item");
                if (!item) {
                    return;
                }

                var label = item.querySelector(".dnd-label");
                var name = label ? normalizeText(label.textContent) : "";
                var message = name
                    ? '"' + name + '" 항목을 삭제할까요?'
                    : "이 항목을 삭제할까요?";

                if (!window.confirm(message)) {
                    return;
                }

                item.remove();
                syncTextareasFromLists(block);
                return;
            }

            if (target.classList.contains("dnd-btn")) {
                var addWrap = target.closest(".dnd-add");
                var column = target.closest(".dnd-column");
                var input = addWrap ? addWrap.querySelector(".dnd-input") : null;
                var list = column ? column.querySelector(".dnd-list") : null;

                if (!input || !list) {
                    return;
                }

                addItemToList(block, list, input.value);
                input.value = "";
                input.focus();
            }
        });

        block.addEventListener("keydown", function (event) {
            if (
                event.key === "Enter" &&
                event.target.classList.contains("dnd-input")
            ) {
                event.preventDefault();

                var input = event.target;
                var column = input.closest(".dnd-column");
                var list = column ? column.querySelector(".dnd-list") : null;

                addItemToList(block, list, input.value);
                input.value = "";
            }
        });

        block.addEventListener("dragstart", function (event) {
            var item = event.target.closest(".dnd-item");
            if (!item) {
                return;
            }

            dragged = item;
            item.classList.add("is-dragging");

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", "");
            }
        });

        block.addEventListener("dragend", function (event) {
            var item = event.target.closest(".dnd-item");

            if (item) {
                item.classList.remove("is-dragging");
            }

            block.querySelectorAll(".dnd-list").forEach(function (list) {
                list.classList.remove("is-over");
            });

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

                var afterElement = getDragAfterElement(list, event.clientY);

                if (afterElement) {
                    list.insertBefore(dragged, afterElement);
                } else {
                    list.appendChild(dragged);
                }
            });

            list.addEventListener("dragleave", function (event) {
                if (!list.contains(event.relatedTarget)) {
                    list.classList.remove("is-over");
                }
            });

            list.addEventListener("drop", function (event) {
                event.preventDefault();
                list.classList.remove("is-over");
                syncTextareasFromLists(block);
            });

            updateEmptyState(list);
        });

        block.querySelectorAll(".template-items").forEach(function (textarea) {
            textarea.addEventListener("input", function () {
                buildListsFromTextareas(block);
            });

            textarea.addEventListener("blur", function () {
                buildListsFromTextareas(block);
            });
        });
    }

    function validateBeforeSubmit() {
        var form = document.getElementById("templateEditorForm");
        if (!form) {
            return;
        }

        form.addEventListener("submit", function (event) {
            var hasDuplicate = false;
            var deleteChecked = form.querySelectorAll(
                ".template-delete-check:checked"
            ).length;

            form.querySelectorAll(".template-block").forEach(function (block) {
                syncTextareasFromLists(block);
                var valid = updateDuplicates(block);
                if (!valid) {
                    hasDuplicate = true;
                }
            });

            if (hasDuplicate) {
                event.preventDefault();
                window.alert("중복 항목이 있는 템플릿은 저장할 수 없습니다. 중복을 먼저 정리해 주세요.");
                return;
            }

            if (deleteChecked > 0) {
                var ok = window.confirm(
                    "삭제 체크된 템플릿이 있습니다. 이대로 저장할까요?"
                );
                if (!ok) {
                    event.preventDefault();
                }
            }
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll(".template-block").forEach(function (block) {
            buildListsFromTextareas(block);
            wireDragAndDrop(block);
        });

        document.querySelectorAll(".accordion-collapse").forEach(function (collapseEl) {
            collapseEl.addEventListener("shown.bs.collapse", function () {
                var block = collapseEl.closest(".template-block");
                if (block) {
                    buildListsFromTextareas(block);
                }
            });
        });

        validateBeforeSubmit();
    });
})();