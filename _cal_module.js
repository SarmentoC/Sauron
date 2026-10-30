
    // ══════════════════════════════════════════════════════════
    // CALENDÁRIO DO GUARDIÃO — Smart Health Calendar Module
    // ══════════════════════════════════════════════════════════

    // ── State ──────────────────────────────────────────────────
    let calYear  = new Date().getFullYear();
    let calMonth = new Date().getMonth();  // 0-indexed
    let calView  = "month";               // "month" | "list"
    let calTimelineFilter = "all";
    let calEventEditingId = null;

    // ── Category config ────────────────────────────────────────
    const CAL_CATS = {
      vaccine:              { icon: "💉", label: "Vacina",                 color: "#d4a842" },
      "deworming-internal": { icon: "🛡",  label: "Desparasitação interna", color: "#5a9e5a" },
      "deworming-external": { icon: "🐛",  label: "Desparasitação externa", color: "#8ba040" },
      deworming:            { icon: "🛡",  label: "Desparasitação",          color: "#5a9e5a" },
      visit:                { icon: "🩺",  label: "Consulta",               color: "#d46832" },
      medication:           { icon: "💊",  label: "Medicação",              color: "#9a58b0" },
      screening:            { icon: "🔬",  label: "Rastreio",               color: "#4a8ab0" },
      diary:                { icon: "📝",  label: "Observação",             color: "#777788" },
      other:                { icon: "📋",  label: "Outro",                  color: "#888877" }
    };

    // ── Status helpers ─────────────────────────────────────────
    const CAL_STATUS_LABELS = {
      completed: "Concluído", cancelled: "Cancelado", postponed: "Adiado",
      overdue: "Em atraso", soon: "Próximo", scheduled: "Agendado",
      active: "Ativo", planned: "Agendado"
    };

    function calResolveStatus(rawStatus, dateStr) {
      if (rawStatus === "completed" || rawStatus === "administered") return "completed";
      if (rawStatus === "cancelled") return "cancelled";
      if (rawStatus === "postponed") return "postponed";
      if (rawStatus === "active") return "active";
      if (!validDate(dateStr)) return "scheduled";
      const days = healthDaysUntil(dateStr);
      if (days === null) return "scheduled";
      if (days < 0) return "overdue";
      if (days <= 7) return "soon";
      return "scheduled";
    }

    // ── Event projection ───────────────────────────────────────
    function projectCalendarEvents() {
      const events = [];

      function push(key, sourceType, sourceId, category, dateStr, title, rawStatus, extra) {
        if (!validDate(dateStr)) return;
        const status = calResolveStatus(rawStatus, dateStr);
        events.push({
          key, sourceType, sourceId, category,
          date: dateStr, title, status,
          notes: extra.notes || null,
          vet: extra.vet || null,
          product: extra.product || null,
          severity: extra.severity || null,
          isProjected: sourceType !== "calendar"
        });
      }

      // Vaccines + deworming records
      health.records.forEach(rec => {
        const cat = rec.type === "vaccine" ? "vaccine"
          : rec.subtype === "external" ? "deworming-external" : "deworming-internal";
        const title = rec.name || (rec.type === "vaccine" ? "Vacina" : "Desparasitação");
        const extras = { notes: rec.notes, product: rec.product };

        if (validDate(rec.date)) {
          const st = rec.done ? "completed" : rec.status;
          push("rec-date-" + rec.id, "record", rec.id, cat, rec.date, title, st, extras);
        }
        if (validDate(rec.appointmentDate) && !rec.done && rec.status !== "administered" && rec.status !== "cancelled") {
          push("rec-appt-" + rec.id, "record", rec.id, "visit", rec.appointmentDate,
            "Consulta · " + title, rec.status, extras);
        }
        if (validDate(rec.nextDue) && !rec.done && rec.status !== "administered" && rec.status !== "cancelled") {
          push("rec-next-" + rec.id, "record", rec.id, cat, rec.nextDue,
            "Próximo · " + title, null, extras);
        }
      });

      // Vet visits
      health.visits.forEach(v => {
        const title = v.reason || "Consulta veterinária";
        if (validDate(v.date)) {
          push("vis-" + v.id, "visit", v.id, "visit", v.date, title, v.status,
            { notes: v.notes, vet: v.vet || v.clinic });
        }
        if (validDate(v.next || v.nextDate) && v.status !== "cancelled") {
          const nextD = v.next || v.nextDate;
          push("vis-next-" + v.id, "visit", v.id, "visit", nextD,
            "Próxima consulta", null, {});
        }
      });

      // Medications
      health.medications.forEach(m => {
        const name = m.name || "Medicação";
        if (validDate(m.startDate)) {
          push("med-start-" + m.id, "medication", m.id, "medication", m.startDate,
            "Início · " + name, m.status === "planned" ? "planned" : (m.status === "completed" ? "completed" : "active"),
            { notes: m.notes, vet: m.vet });
        }
        if (validDate(m.endDate)) {
          push("med-end-" + m.id, "medication", m.id, "medication", m.endDate,
            "Fim · " + name, m.status === "completed" ? "completed" : null,
            { notes: m.notes, vet: m.vet });
        }
      });

      // Screenings
      health.screenings.forEach(s => {
        const name = s.name || "Rastreio";
        if (validDate(s.completedDate)) {
          push("scr-done-" + s.id, "screening", s.id, "screening", s.completedDate,
            name + " (realizado)", "completed", { notes: s.notes });
        } else if (validDate(s.plannedDate)) {
          push("scr-plan-" + s.id, "screening", s.id, "screening", s.plannedDate,
            name, null, { notes: s.notes });
        }
        if (validDate(s.nextDate)) {
          push("scr-next-" + s.id, "screening", s.id, "screening", s.nextDate,
            "Revisão · " + name, null, { notes: s.notes });
        }
      });

      // Health diary
      health.diary.forEach(d => {
        push("diary-" + d.id, "diary", d.id, "diary", d.date,
          d.symptom || "Observação de saúde",
          d.status === "resolved" ? "completed" : null,
          { notes: d.notes, severity: d.severity });
      });

      // Custom calendar events
      (health.calendarEvents || []).forEach(e => {
        push("cal-" + e.id, "calendar", e.id, e.type || "other", e.date,
          e.title || "Evento", e.status, { notes: e.notes, vet: e.vet });
      });

      return events;
    }

    // Build date → events map
    function buildCalMap(events) {
      const map = {};
      events.forEach(ev => {
        if (!map[ev.date]) map[ev.date] = [];
        map[ev.date].push(ev);
      });
      return map;
    }

    // ── Summary cards ──────────────────────────────────────────
    function renderCalSummaryCards() {
      const container = $("calSummaryGrid");
      if (!container) return;

      const all = projectCalendarEvents();
      const t = today();

      const nextVax = all.filter(e => e.category === "vaccine" && e.status !== "completed" &&
        e.status !== "cancelled" && e.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];

      const nextDew = all.filter(e =>
        (e.category === "deworming-internal" || e.category === "deworming-external" || e.category === "deworming") &&
        e.status !== "completed" && e.status !== "cancelled" && e.date >= t)
        .sort((a, b) => a.date.localeCompare(b.date))[0];

      const nextVis = all.filter(e => e.category === "visit" &&
        e.status !== "completed" && e.status !== "cancelled" && e.date >= t)
        .sort((a, b) => a.date.localeCompare(b.date))[0];

      const pending = all.filter(e =>
        e.status === "overdue" || (e.status === "soon" && e.status !== "cancelled")).length;

      function makeCard(icon, label, ev) {
        const days = ev ? healthDaysUntil(ev.date) : null;
        const urgent = days !== null && days < 0;
        const val = ev
          ? (days < 0 ? "Em atraso" : days === 0 ? "Hoje" : "Em " + days + (days === 1 ? " dia" : " dias"))
          : "—";
        const sub = ev ? displayDate(ev.date) + " · " + ev.title : "Sem dados registados";
        return { icon, label, val, sub, urgent };
      }

      const cards = [
        makeCard("💉", "Próxima vacina", nextVax),
        makeCard("🛡", "Próxima desparasitação", nextDew),
        makeCard("🩺", "Próxima consulta", nextVis),
        {
          icon: "⚠️", label: "Eventos pendentes",
          val: pending > 0 ? String(pending) : "—",
          sub: pending > 0 ? pending + " evento" + (pending !== 1 ? "s" : "") + " em atraso ou próximos" : "Sem eventos urgentes",
          urgent: pending > 0
        }
      ];

      container.innerHTML = "";
      cards.forEach(c => {
        const div = document.createElement("div");
        div.className = "box cal-summary-card" + (c.urgent ? " cal-urgent" : "");
        div.innerHTML =
          '<div class="lab"><span class="cal-card-icon">' + c.icon + '</span> ' + c.label + '</div>' +
          '<div class="big">' + c.val + '</div>' +
          '<p class="note">' + c.sub + '</p>';
        container.appendChild(div);
      });
    }

    // ── Calendar grid ──────────────────────────────────────────
    function renderCalGrid() {
      const gridContainer = $("calMonthGrid");
      const labelEl = $("calMonthLabel");
      if (!gridContainer || !labelEl) return;

      const all = projectCalendarEvents();
      const map = buildCalMap(all);

      const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                      "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
      labelEl.textContent = MONTHS[calMonth] + " " + calYear;

      gridContainer.innerHTML = "";

      // Day header row
      const header = document.createElement("div");
      header.className = "cal-grid-header";
      ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].forEach(d => {
        const th = document.createElement("div");
        th.className = "cal-grid-th";
        th.textContent = d;
        header.appendChild(th);
      });
      gridContainer.appendChild(header);

      const firstDay = new Date(calYear, calMonth, 1);
      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      const todayStr = today();
      const startDow = (firstDay.getDay() + 6) % 7;  // 0=Mon

      const body = document.createElement("div");
      body.className = "cal-grid-body";

      const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

      for (let i = 0; i < totalCells; i++) {
        const dayNum = i - startDow + 1;
        const cell = document.createElement("div");

        if (dayNum < 1 || dayNum > daysInMonth) {
          cell.className = "cal-cell cal-cell-empty";
          body.appendChild(cell);
          continue;
        }

        const dateStr = calYear + "-" +
          String(calMonth + 1).padStart(2, "0") + "-" +
          String(dayNum).padStart(2, "0");
        const dayEvs = map[dateStr] || [];
        const isToday = dateStr === todayStr;
        const isPast = dateStr < todayStr;
        const hasOverdue = dayEvs.some(e => e.status === "overdue");

        cell.className = "cal-cell" +
          (isToday ? " cal-today" : "") +
          (hasOverdue ? " cal-has-overdue" : "") +
          (isPast && !hasOverdue ? " cal-past" : "");

        const numDiv = document.createElement("div");
        numDiv.className = "cal-day-num";
        numDiv.textContent = dayNum;
        cell.appendChild(numDiv);

        if (dayEvs.length > 0) {
          const dotsRow = document.createElement("div");
          dotsRow.className = "cal-dots";
          dayEvs.slice(0, 3).forEach(ev => {
            const dot = document.createElement("span");
            dot.className = "cal-dot cal-dot-" + ev.status;
            dot.style.background = (CAL_CATS[ev.category] || CAL_CATS.other).color;
            dotsRow.appendChild(dot);
          });
          if (dayEvs.length > 3) {
            const more = document.createElement("span");
            more.className = "cal-dot-more";
            more.textContent = "+" + (dayEvs.length - 3);
            dotsRow.appendChild(more);
          }
          cell.appendChild(dotsRow);
        }

        cell.addEventListener("click", () => openCalDayModal(dateStr));
        body.appendChild(cell);
      }

      gridContainer.appendChild(body);
    }

    // ── Sidebar: upcoming events ───────────────────────────────
    function renderCalSidebar() {
      const container = $("calUpcomingList");
      if (!container) return;

      const t = today();
      const all = projectCalendarEvents();

      const overdue = all
        .filter(e => e.status === "overdue")
        .sort((a, b) => b.date.localeCompare(a.date));

      const upcoming = all
        .filter(e => e.status !== "completed" && e.status !== "cancelled" && e.date >= t)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 8);

      const toShow = [...overdue.slice(0, 3), ...upcoming].slice(0, 10);

      if (!toShow.length) {
        container.innerHTML = '<p class="note" style="padding:8px 0">Nenhum evento agendado.</p>';
        return;
      }

      container.innerHTML = "";
      toShow.forEach(ev => {
        const cat = CAL_CATS[ev.category] || CAL_CATS.other;
        const days = healthDaysUntil(ev.date);
        const daysText = days === null ? ""
          : days < 0 ? "Em atraso · " + Math.abs(days) + "d"
          : days === 0 ? "Hoje"
          : days === 1 ? "Amanhã"
          : "Em " + days + " dias";

        const item = document.createElement("div");
        item.className = "cal-sidebar-item cal-sidebar-" + ev.status;
        item.innerHTML =
          '<span class="cal-sidebar-icon">' + cat.icon + '</span>' +
          '<div class="cal-sidebar-info">' +
            '<strong>' + ev.title + '</strong>' +
            '<small>' + displayDate(ev.date) + (daysText ? " · " + daysText : "") + '</small>' +
          '</div>';
        item.addEventListener("click", () => {
          const d = new Date(ev.date + "T12:00:00");
          calYear = d.getFullYear();
          calMonth = d.getMonth();
          calView = "month";
          $("calMonthPanel").hidden = false;
          $("calListView").hidden = true;
          renderCalGrid();
          renderCalSidebar();
          openCalDayModal(ev.date);
        });
        container.appendChild(item);
      });
    }

    // ── List view ──────────────────────────────────────────────
    function renderCalListView() {
      const container = $("calListContent");
      if (!container) return;

      const all = projectCalendarEvents();
      all.sort((a, b) => a.date.localeCompare(b.date));

      if (!all.length) {
        container.innerHTML = '<p class="note">Sem eventos registados.</p>';
        return;
      }

      container.innerHTML = "";
      let lastMonth = null;

      all.forEach(ev => {
        const mKey = ev.date.slice(0, 7);
        if (mKey !== lastMonth) {
          lastMonth = mKey;
          const sep = document.createElement("div");
          sep.className = "cal-list-month-sep";
          sep.textContent = new Date(ev.date + "T12:00:00")
            .toLocaleDateString("pt-PT", { year: "numeric", month: "long" });
          container.appendChild(sep);
        }

        const cat = CAL_CATS[ev.category] || CAL_CATS.other;
        const tagLabel = CAL_STATUS_LABELS[ev.status] || ev.status;
        const days = healthDaysUntil(ev.date);
        const daysText = (ev.status === "completed" || ev.status === "cancelled")
          ? "" : (days === null ? ""
            : days < 0 ? "Em atraso " + Math.abs(days) + " dias"
            : days === 0 ? "Hoje" : "Em " + days + " dias");

        const item = document.createElement("div");
        item.className = "cal-list-item cal-list-" + ev.status;
        item.innerHTML =
          '<span class="cal-list-icon" style="color:' + cat.color + '">' + cat.icon + '</span>' +
          '<div class="cal-list-info">' +
            '<div><strong>' + ev.title + '</strong>' +
              '<span class="cal-tag cal-tag-' + ev.status + '">' + tagLabel + '</span>' +
            '</div>' +
            '<small>' + displayDate(ev.date) + (daysText ? " · " + daysText : "") + '</small>' +
            (ev.notes ? '<p class="note" style="margin:2px 0 0">' + ev.notes + '</p>' : '') +
          '</div>' +
          (ev.sourceType === "calendar"
            ? '<button type="button" class="ghost cal-edit-btn" data-cal-id="' + ev.sourceId + '">Editar</button>'
            : '');

        if (ev.sourceType === "calendar") {
          item.querySelector(".cal-edit-btn")?.addEventListener("click", () => editCalendarEvent(ev.sourceId));
        }
        container.appendChild(item);
      });
    }

    // ── History timeline ───────────────────────────────────────
    function renderCalTimeline() {
      const container = $("calTimelineContent");
      if (!container) return;

      let all = projectCalendarEvents();

      if (calTimelineFilter !== "all") {
        const f = calTimelineFilter;
        all = all.filter(e => e.category === f ||
          (f === "deworming-internal" && e.category === "deworming") ||
          (f === "deworming-external" && e.category === "deworming"));
      }

      all.sort((a, b) => b.date.localeCompare(a.date));

      if (!all.length) {
        container.innerHTML = '<p class="note">Nenhum evento para o filtro selecionado.</p>';
        return;
      }

      container.innerHTML = "";
      all.forEach(ev => {
        const cat = CAL_CATS[ev.category] || CAL_CATS.other;
        const statusLabel = CAL_STATUS_LABELS[ev.status] || ev.status;
        const days = healthDaysUntil(ev.date);
        const pastText = (days !== null && days < 0)
          ? " · " + Math.abs(days) + " dia" + (Math.abs(days) !== 1 ? "s" : "") + " atrás" : "";

        const item = document.createElement("div");
        item.className = "cal-timeline-item cal-tl-" + ev.status;
        item.innerHTML =
          '<div class="cal-tl-marker" style="background:' + cat.color + '">' + cat.icon + '</div>' +
          '<div class="cal-tl-content">' +
            '<div class="cal-tl-header">' +
              '<strong>' + ev.title + '</strong>' +
              '<span class="cal-tl-status cal-tl-status-' + ev.status + '">' + statusLabel + '</span>' +
            '</div>' +
            '<small class="cal-tl-date">' + displayDate(ev.date) + pastText + '</small>' +
            (ev.notes ? '<p class="cal-tl-notes">' + ev.notes + '</p>' : '') +
            (ev.vet ? '<small class="cal-tl-vet">👨‍⚕️ ' + ev.vet + '</small>' : '') +
          '</div>';
        container.appendChild(item);
      });
    }

    // ── Day detail modal ───────────────────────────────────────
    function openCalDayModal(dateStr) {
      const dialog = $("calendarDayDialog");
      const titleEl = $("calDayModalTitle");
      const listEl = $("calDayModalList");
      if (!dialog || !titleEl || !listEl) return;

      const d = new Date(dateStr + "T12:00:00");
      titleEl.textContent = d.toLocaleDateString("pt-PT",
        { weekday: "long", day: "numeric", month: "long", year: "numeric" });

      const dayEvs = projectCalendarEvents().filter(e => e.date === dateStr);
      listEl.innerHTML = "";

      if (!dayEvs.length) {
        listEl.innerHTML = '<p class="note">Nenhum evento neste dia.</p>';
      } else {
        dayEvs.forEach(ev => {
          const cat = CAL_CATS[ev.category] || CAL_CATS.other;
          const tagLabel = CAL_STATUS_LABELS[ev.status] || ev.status;

          const item = document.createElement("div");
          item.className = "cal-day-event";
          item.innerHTML =
            '<div class="cal-day-event-header">' +
              '<span style="color:' + cat.color + '">' + cat.icon + '</span>' +
              '<strong>' + ev.title + '</strong>' +
              '<span class="cal-tag cal-tag-' + ev.status + '">' + tagLabel + '</span>' +
            '</div>' +
            (ev.notes ? '<p class="note" style="margin:4px 0">' + ev.notes + '</p>' : '') +
            (ev.vet ? '<small style="color:var(--mut)">👨‍⚕️ ' + ev.vet + '</small>' : '') +
            (ev.product ? '<small style="color:var(--mut)"> · ' + ev.product + '</small>' : '') +
            (ev.sourceType === "calendar"
              ? '<div class="cal-day-event-actions">' +
                  '<button type="button" class="ghost cal-dme-edit" data-id="' + ev.sourceId + '">Editar</button>' +
                  '<button type="button" class="ghost cal-dme-del" data-id="' + ev.sourceId + '" style="color:var(--fire)">Eliminar</button>' +
                '</div>'
              : '');

          item.querySelector(".cal-dme-edit")?.addEventListener("click", () => {
            dialog.close();
            editCalendarEvent(ev.sourceId);
          });
          item.querySelector(".cal-dme-del")?.addEventListener("click", () => {
            if (!confirm('Eliminar "' + ev.title + '"?\nEsta ação não pode ser desfeita.')) return;
            health.calendarEvents = (health.calendarEvents || []).filter(e => e.id !== ev.sourceId);
            persist();
            dialog.close();
            renderHealthCalendar();
            status("Evento eliminado.");
          });

          listEl.appendChild(item);
        });
      }

      $("calDayAddEventBtn").dataset.date = dateStr;
      dialog.showModal();
    }

    // ── Event editor ───────────────────────────────────────────
    function editCalendarEvent(id = null) {
      calEventEditingId = id;
      const ev = id ? (health.calendarEvents || []).find(e => e.id === id) : null;

      $("calEventTitle").value  = ev?.title  || "";
      $("calEventType").value   = ev?.type   || "other";
      $("calEventDate").value   = ev?.date   || "";
      $("calEventNotes").value  = ev?.notes  || "";
      $("calEventVet").value    = ev?.vet    || "";
      $("calEventStatus").value = ev?.status || "planned";
      $("calEventFormTitle").textContent = id ? "Editar evento" : "Novo evento";

      $("calendarEventDialog").showModal();
    }

    function saveCalendarEvent(e) {
      e.preventDefault();

      const title = $("calEventTitle").value.trim();
      const date  = $("calEventDate").value;

      if (!title) { status("Preenche o título do evento."); return; }
      if (!validDate(date)) { status("Data inválida."); return; }

      const ev = {
        id:     calEventEditingId || makeId(),
        title,
        type:   $("calEventType").value,
        date,
        status: $("calEventStatus").value,
        notes:  $("calEventNotes").value.trim() || null,
        vet:    $("calEventVet").value.trim() || null
      };

      if (!health.calendarEvents) health.calendarEvents = [];

      if (calEventEditingId) {
        const idx = health.calendarEvents.findIndex(x => x.id === calEventEditingId);
        if (idx >= 0) health.calendarEvents[idx] = ev;
        else health.calendarEvents.push(ev);
      } else {
        health.calendarEvents.push(ev);
      }

      persist();
      $("calendarEventDialog").close();
      calEventEditingId = null;

      // Navigate to the saved event's month
      const d = new Date(ev.date + "T12:00:00");
      calYear  = d.getFullYear();
      calMonth = d.getMonth();

      renderHealthCalendar();
      status("Evento guardado.");
    }

    // ── Main render ────────────────────────────────────────────
    function renderHealthCalendar() {
      renderCalSummaryCards();
      if (calView === "month") {
        $("calMonthPanel").hidden = false;
        $("calListView").hidden = true;
        $("calViewMonthBtn").classList.add("active");
        $("calViewListBtn").classList.remove("active");
        renderCalGrid();
        renderCalSidebar();
      } else {
        $("calMonthPanel").hidden = true;
        $("calListView").hidden = false;
        $("calViewMonthBtn").classList.remove("active");
        $("calViewListBtn").classList.add("active");
        renderCalListView();
      }
      renderCalTimeline();
    }

    // ── Init ───────────────────────────────────────────────────
    function initHealthCalendar() {
      // Month navigation
      $("calPrevMonthBtn").addEventListener("click", () => {
        if (calMonth === 0) { calMonth = 11; calYear--; } else calMonth--;
        renderCalGrid(); renderCalSidebar();
      });
      $("calNextMonthBtn").addEventListener("click", () => {
        if (calMonth === 11) { calMonth = 0; calYear++; } else calMonth++;
        renderCalGrid(); renderCalSidebar();
      });
      $("calTodayBtn").addEventListener("click", () => {
        const now = new Date();
        calYear = now.getFullYear(); calMonth = now.getMonth();
        renderCalGrid(); renderCalSidebar();
      });

      // View toggle
      $("calViewMonthBtn").addEventListener("click", () => { calView = "month"; renderHealthCalendar(); });
      $("calViewListBtn").addEventListener("click",  () => { calView = "list";  renderHealthCalendar(); });

      // Add event button
      $("addCalEventBtn").addEventListener("click", () => editCalendarEvent());

      // Day modal buttons
      $("calDayModalClose").addEventListener("click", () => $("calendarDayDialog").close());
      $("calDayAddEventBtn").addEventListener("click", () => {
        const date = $("calDayAddEventBtn").dataset.date;
        $("calendarDayDialog").close();
        editCalendarEvent();
        if (date) $("calEventDate").value = date;
      });
      $("calendarDayDialog").addEventListener("click", e => {
        if (e.target === $("calendarDayDialog")) $("calendarDayDialog").close();
      });

      // Event form
      $("calEventForm").addEventListener("submit", saveCalendarEvent);
      $("calEventFormClose").addEventListener("click", () => {
        calEventEditingId = null;
        $("calendarEventDialog").close();
      });
      $("calEventCancelBtn").addEventListener("click", () => {
        calEventEditingId = null;
        $("calendarEventDialog").close();
      });
      $("calendarEventDialog").addEventListener("click", e => {
        if (e.target === $("calendarEventDialog")) { calEventEditingId = null; $("calendarEventDialog").close(); }
      });

      // Timeline filter
      $("calTimelineFilter").addEventListener("change", e => {
        calTimelineFilter = e.target.value;
        renderCalTimeline();
      });
    }

    // Self-initialize after document is ready (module is appended after startup sequence)
    window._calReady = true;
    initHealthCalendar();
    renderHealthCalendar();
