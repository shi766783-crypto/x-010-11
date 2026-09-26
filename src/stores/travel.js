import { defineStore } from 'pinia'
import { planStorage, libraryStorage } from '../services/storage'
import { generateLuggageTemplate, getDestinationType } from '../services/luggage'
import { generateDefaultTodos } from '../services/todo'
import { computeAchievements, TOTAL_ACHIEVEMENTS } from '../services/achievements'
import { computeDashboardStats, computeMemberLeaderboard } from '../services/stats'
import { daysBetween } from '../utils/format'
import { uid } from '../utils/id'

// 根据出行人数与可选姓名生成成员列表
function buildMemberNames(input) {
  const count = Math.max(1, Number(input.memberCount) || 1)
  const provided = (input.memberNames || []).map((s) => String(s).trim()).filter(Boolean)
  return Array.from({ length: count }, (_, i) => provided[i] || `成员${i + 1}`)
}

// 将物品库条目拷贝为计划内的行李物品（生成新 id，与库条目互不影响）
function toLuggageItem(libItem) {
  return { id: uid(), name: libItem.name, category: libItem.category, custom: true, packed: false }
}

export const useTravelStore = defineStore('travel', {
  state: () => ({
    plans: [],
    itemLibrary: [],
  }),

  getters: {
    achievements: (state) => computeAchievements(state.plans),
    totalAchievements: () => TOTAL_ACHIEVEMENTS,
    dashboardStats: (state) => computeDashboardStats(state.plans),
    leaderboard: (state) => computeMemberLeaderboard(state.plans),
    planById: (state) => (id) => state.plans.find((p) => p.id === id),
  },

  actions: {
    // ===== 持久化 =====
    load() {
      this.plans = planStorage.read([])
      this.itemLibrary = libraryStorage.read([])
    },
    persist() {
      planStorage.write(this.plans)
      libraryStorage.write(this.itemLibrary)
    },

    // ===== 出行计划 =====
    createPlan(input) {
      const days = daysBetween(input.startDate, input.endDate)
      const destinationType = getDestinationType(input.tripType)
      const memberNames = buildMemberNames(input)
      const members = memberNames.map((name) => ({ id: uid(), name }))
      // 新建计划时从物品库挑选的物品（快照拷贝，与库条目解耦）
      const libraryPicks = (input.libraryItemIds || [])
        .map((id) => this.itemLibrary.find((i) => i.id === id))
        .filter(Boolean)
      const luggage = members.map((m) => {
        const items = generateLuggageTemplate({ tripType: input.tripType, days })
        for (const libItem of libraryPicks) {
          // 同名物品不重复加入（模板中可能已存在）
          if (items.some((i) => i.name === libItem.name)) continue
          items.push(toLuggageItem(libItem))
        }
        return { memberId: m.id, items }
      })

      const plan = {
        id: uid(),
        name: input.name,
        destination: input.destination,
        destinationType,
        tripType: input.tripType,
        startDate: input.startDate,
        endDate: input.endDate,
        days,
        memberCount: members.length,
        transport: input.transport,
        accommodation: input.accommodation,
        budget: Number(input.budget) || 0,
        notes: input.notes,
        photo: input.photo || '',
        members,
        luggage,
        todos: generateDefaultTodos(),
        records: [],
        summary: null,
        createdAt: new Date().toISOString(),
      }
      this.plans.unshift(plan)
      return plan.id
    },

    updatePlan(id, input) {
      const plan = this.planById(id)
      if (!plan) return
      const days = daysBetween(input.startDate, input.endDate)
      Object.assign(plan, {
        name: input.name,
        destination: input.destination,
        destinationType: getDestinationType(input.tripType),
        tripType: input.tripType,
        startDate: input.startDate,
        endDate: input.endDate,
        days,
        transport: input.transport,
        accommodation: input.accommodation,
        budget: Number(input.budget) || 0,
        notes: input.notes,
        photo: input.photo || '',
      })
    },

    deletePlan(id) {
      this.plans = this.plans.filter((p) => p.id !== id)
    },

    // ===== 行李清单 =====
    _findLuggageList(plan, memberId) {
      let list = plan.luggage.find((l) => l.memberId === memberId)
      if (!list) {
        list = { memberId, items: [] }
        plan.luggage.push(list)
      }
      return list
    },

    togglePack(planId, memberId, itemId) {
      const plan = this.planById(planId)
      if (!plan) return
      const list = plan.luggage.find((l) => l.memberId === memberId)
      const target = list?.items.find((i) => i.id === itemId)
      if (target) target.packed = !target.packed
    },

    addCustomItem(planId, memberId, name, category, saveToLibrary = false) {
      const plan = this.planById(planId)
      const trimmed = String(name).trim()
      if (!plan || !trimmed) return
      const list = this._findLuggageList(plan, memberId)
      // 同一清单内同名物品不重复添加
      if (!list.items.some((i) => i.name === trimmed)) {
        list.items.push({ id: uid(), name: trimmed, category, custom: true, packed: false })
      }
      // 自定义物品沉淀到个人物品库，供其他计划复用
      if (saveToLibrary) this.addLibraryItem(trimmed, category)
    },

    // 从物品库挑选物品加入清单，跳过清单中已存在的同名物品
    addLibraryItemsToLuggage(planId, memberId, libraryIds) {
      const plan = this.planById(planId)
      if (!plan) return
      const list = this._findLuggageList(plan, memberId)
      for (const id of libraryIds) {
        const libItem = this.itemLibrary.find((i) => i.id === id)
        if (!libItem) continue
        if (list.items.some((i) => i.name === libItem.name)) continue
        list.items.push(toLuggageItem(libItem))
      }
    },

    removeItem(planId, memberId, itemId) {
      const plan = this.planById(planId)
      if (!plan) return
      const list = plan.luggage.find((l) => l.memberId === memberId)
      if (!list) return
      list.items = list.items.filter((i) => i.id !== itemId)
    },

    // ===== 个人物品库 =====
    addLibraryItem(name, category) {
      const trimmed = String(name).trim()
      if (!trimmed) return null
      // 库内按名称去重，同一物品只保留一条
      const existing = this.itemLibrary.find((i) => i.name === trimmed)
      if (existing) return existing
      const item = { id: uid(), name: trimmed, category }
      this.itemLibrary.push(item)
      return item
    },

    // 仅删除库内条目；已生成到各计划中的物品是独立快照，不受影响
    removeLibraryItem(id) {
      this.itemLibrary = this.itemLibrary.filter((i) => i.id !== id)
    },

    // ===== 待办清单 =====
    toggleTodo(planId, todoId) {
      const plan = this.planById(planId)
      const todo = plan?.todos.find((t) => t.id === todoId)
      if (todo) todo.done = !todo.done
    },

    addTodo(planId, name) {
      const plan = this.planById(planId)
      if (plan) plan.todos.push({ id: uid(), name, done: false })
    },

    removeTodo(planId, todoId) {
      const plan = this.planById(planId)
      if (plan) plan.todos = plan.todos.filter((t) => t.id !== todoId)
    },

    // ===== 行程与花费 =====
    addRecord(planId, record) {
      const plan = this.planById(planId)
      if (plan) plan.records.push({ id: uid(), ...record })
    },

    updateRecord(planId, recordId, record) {
      const plan = this.planById(planId)
      const target = plan?.records.find((r) => r.id === recordId)
      if (target) Object.assign(target, record)
    },

    deleteRecord(planId, recordId) {
      const plan = this.planById(planId)
      if (plan) plan.records = plan.records.filter((r) => r.id !== recordId)
    },

    // ===== 出行总结 =====
    saveSummary(planId, summary) {
      const plan = this.planById(planId)
      if (plan) plan.summary = summary
    },
  },
})
