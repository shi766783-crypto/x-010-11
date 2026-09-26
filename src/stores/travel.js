import { defineStore } from 'pinia'
import { planStorage, itemLibraryStorage } from '../services/storage'
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
      this.itemLibrary = itemLibraryStorage.read([])
    },
    persist() {
      planStorage.write(this.plans)
      itemLibraryStorage.write(this.itemLibrary)
    },

    // ===== 出行计划 =====
    createPlan(input) {
      const days = daysBetween(input.startDate, input.endDate)
      const destinationType = getDestinationType(input.tripType)
      const memberNames = buildMemberNames(input)
      const members = memberNames.map((name) => ({ id: uid(), name }))
      const luggage = members.map((m) => ({
        memberId: m.id,
        items: generateLuggageTemplate({ tripType: input.tripType, days }),
      }))

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

    addCustomItem(planId, memberId, name, category) {
      const plan = this.planById(planId)
      if (!plan) return
      const list = this._findLuggageList(plan, memberId)
      // 同名物品不重复添加
      if (list.items.some((i) => i.name === name)) return
      list.items.push({ id: uid(), name, category, custom: true, packed: false })
      // 自定义物品同步沉淀到个人物品库
      this._upsertLibraryItem(name, category)
    },

    addItemFromLibrary(planId, memberId, libraryItemId) {
      const plan = this.planById(planId)
      const entry = this.itemLibrary.find((i) => i.id === libraryItemId)
      if (!plan || !entry) return
      const list = this._findLuggageList(plan, memberId)
      // 同一物品重复挑选时不产生重复条目
      if (list.items.some((i) => i.name === entry.name)) return
      list.items.push({ id: uid(), name: entry.name, category: entry.category, custom: true, packed: false })
    },

    // ===== 个人物品库 =====
    // 按名称收录物品，已存在时直接返回原条目
    _upsertLibraryItem(name, category) {
      const exist = this.itemLibrary.find((i) => i.name === name)
      if (exist) return exist
      const entry = { id: uid(), name, category }
      this.itemLibrary.push(entry)
      return entry
    },

    addLibraryItem(name, category) {
      const trimmed = String(name || '').trim()
      if (!trimmed || this.itemLibrary.some((i) => i.name === trimmed)) return false
      this.itemLibrary.push({ id: uid(), name: trimmed, category })
      return true
    },

    // 仅删除库条目，不影响已生成到各计划里的物品
    removeLibraryItem(id) {
      this.itemLibrary = this.itemLibrary.filter((i) => i.id !== id)
    },

    removeItem(planId, memberId, itemId) {
      const plan = this.planById(planId)
      if (!plan) return
      const list = plan.luggage.find((l) => l.memberId === memberId)
      if (!list) return
      list.items = list.items.filter((i) => i.id !== itemId)
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
