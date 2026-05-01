const { test, expect } = require('@playwright/test')

const BASE_URL = 'http://127.0.0.1:3000'
const TEST_FIRST = 'QA'
const TEST_LAST = 'Fase4'
const TEST_STORY = 'Historia QA Fase 4'

test('phase 4 smoke', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`)
  await page.locator('input[name="email"]').fill('admin@demo.com')
  await page.locator('input[name="password"]').fill('admin123')
  await page.locator('button[type="submit"]').click()

  await expect(page).toHaveURL(/familia-demo\/tree/)
  await expect(page.getByText('Nueva persona')).toBeVisible()

  await page.getByRole('link', { name: 'Nueva persona' }).click()
  await expect(page).toHaveURL(/familia-demo\/person\/new/)

  const visibleInputs = page.locator('input:not([type="hidden"])')
  await visibleInputs.nth(0).fill(TEST_FIRST)
  await visibleInputs.nth(1).fill(TEST_LAST)
  await page.locator('button', { hasText: 'Crear persona' }).click()

  await expect(page).toHaveURL(/familia-demo\/person\/.+\/edit/)
  const editUrl = page.url()
  const personId = editUrl.split('/person/')[1].split('/edit')[0]

  const selects = page.locator('select')
  await selects.nth(1).selectOption({ label: 'Carlos Martínez Rojas' })
  await selects.nth(2).selectOption({ label: 'Ana López Vega' })
  await page.locator('button', { hasText: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados.')).toBeVisible()

  await page.goto(`${BASE_URL}/familia-demo/person/${personId}`)
  await expect(page.getByText(`${TEST_FIRST} ${TEST_LAST}`)).toBeVisible()

  await page.getByRole('button', { name: /Historias/i }).click()
  await page.getByRole('link', { name: 'Nuevo' }).click()
  await expect(page).toHaveURL(/type=STORY/)

  await page.locator('input:not([type="hidden"])').first().fill(TEST_STORY)
  await page.locator('textarea').first().fill('Historia de prueba para verificacion funcional de Fase 4.')
  await page.locator('button', { hasText: 'Crear' }).click()

  await expect(page).toHaveURL(new RegExp(`/familia-demo/person/${personId}$`))
  await page.getByRole('button', { name: /Historias/i }).click()
  await expect(page.getByText(TEST_STORY)).toBeVisible()

  await page.goto(editUrl)
  page.once('dialog', dialog => dialog.accept())
  await page.locator('button', { hasText: 'Eliminar persona' }).click()
})
