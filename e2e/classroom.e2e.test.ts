import { readFile } from 'node:fs/promises';
import { expect, inject, it } from 'vitest';
import type { Page } from 'playwright-core';
import { launchChrome, exposeTestHooks, partCount } from './harness';
import { openKitScene } from './kitScene';
import { classroomFixture } from '../src/classroom/fixtures';
import { assignmentOf, classroomBytes, readAssignment, readSubmission, submissionOf } from '../src/classroom/envelope';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { controlClassroomPhysics } from './classroomWorkers';

async function command(page: Page, label: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('Search commands').fill(label);
  await page.getByText(label, { exact: true }).click();
}

it('exports an existing Case with its robot and budget', async () => {
  const browser = await launchChrome();
  const teacherContext = await browser.newContext({ acceptDownloads: true });
  const teacher = await teacherContext.newPage();
  const { bundle } = classroomFixture();

  try {
    await exposeTestHooks(teacher);
    await openKitScene(
      teacher,
      {
        name: bundle.title,
        parts: bundle.robot.parts,
        project: {
          ...DEFAULT_PROJECT,
          labelParts: false,
          joints: bundle.robot.joints,
          cases: [bundle.case],
          budgetUsd: 60,
        },
      },
      inject('webUrl'),
    );
    await command(teacher, 'Show Cases');
    await teacher
      .getByTestId('cases-panel')
      .getByRole('button', { name: new RegExp(bundle.case.name) })
      .click();

    const exported = teacher.waitForEvent('download');

    await command(teacher, 'Export Assignment');

    const assignmentBytes = new Uint8Array(await readFile((await (await exported).path())!));
    const assignment = await readAssignment(assignmentBytes);

    expect(assignment.budgetUsd).toBe(60);
    expect(assignment.bundle.case).toEqual(bundle.case);
    expect(assignment.bundle.robot.parts).toEqual(bundle.robot.parts);
  } finally {
    await browser.close();
  }
});

it('edits an independent assignment attempt and exports its robot submission', async () => {
  const browser = await launchChrome();
  const student = await browser.newPage({ acceptDownloads: true });
  const { bundle } = classroomFixture();
  const assignment = await assignmentOf(bundle, 60);
  const file = {
    name: 'assignment.caseclass',
    mimeType: 'application/json',
    buffer: Buffer.from(classroomBytes(assignment)),
  };

  try {
    await student.goto(`${inject('webUrl')}/classroom`);
    await student.getByLabel('Assignment file').setInputFiles(file);
    await student.getByLabel('Name').fill('Ada');
    await exposeTestHooks(student);
    await student.getByRole('button', { name: 'Start Attempt', exact: true }).click();
    await student.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await student.mouse.click(720, 450);
    await student.keyboard.press('a');
    await student.getByRole('button', { name: /^Cube/ }).first().click();
    await expect.poll(() => partCount(student)).toBe(bundle.robot.parts.length + 1);

    const delivered = student.waitForEvent('download');

    await command(student, 'Submit');

    const download = await delivered;
    const bytes = new Uint8Array(await readFile((await download.path())!));
    const submitted = await readSubmission(bytes);

    expect(submitted.name).toBe('Ada');
    expect(submitted.bundle.robot.parts).toHaveLength(bundle.robot.parts.length + 1);
    expect(submitted.assignmentFingerprint).toBe(assignment.fingerprint);
  } finally {
    await browser.close();
  }
});

it('grades two revisions and opens the failing Check without losing the grid', async () => {
  const browser = await launchChrome();
  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const { bundle } = classroomFixture();
  const assignment = await assignmentOf(bundle, 60);
  const first = await submissionOf(assignment, bundle, 'Ada');
  const bytes = classroomBytes(first);
  const file = {
    name: 'assignment.caseclass',
    mimeType: 'application/json',
    buffer: Buffer.from(classroomBytes(assignment)),
  };

  try {
    await teacher.goto(`${inject('webUrl')}/classroom`);
    await controlClassroomPhysics(teacher);
    await teacher.getByLabel('Assignment file').setInputFiles(file);

    const failed = structuredClone(bundle);

    failed.robot.joints = [];

    const second = await submissionOf(assignment, failed, 'Ada');

    await teacher.getByLabel('Submission files').setInputFiles([
      { name: 'ada.casesubmit', mimeType: 'application/json', buffer: Buffer.from(bytes) },
      { name: 'ada-revision.casesubmit', mimeType: 'application/json', buffer: Buffer.from(classroomBytes(second)) },
    ]);
    await teacher.getByRole('button', { name: 'Grade', exact: true }).click();
    await expect.poll(() => teacher.locator('[data-classroom-status="complete"]').count()).toBe(2);
    expect(await teacher.locator('[data-submission]').first().innerText()).toContain('20/20');
    expect(await teacher.locator('[data-submission]').last().innerText()).toContain('This Case needs wheels.');
    expect(await teacher.locator('[data-submission]').last().locator('[data-status="fail"]').count()).toBeGreaterThan(
      0,
    );

    const failingCheck = await teacher
      .locator('[data-submission]')
      .last()
      .locator('[data-status="fail"] button[aria-expanded]')
      .first()
      .innerText();

    const opened = teacherContext.waitForEvent('page');

    await teacher.locator('[data-submission]').last().getByRole('button', { name: 'Open Scene' }).click();

    const inspection = await opened;

    await exposeTestHooks(inspection);
    await expect
      .poll(() => inspection.getByRole('tab', { name: /^(?:\d+ to fix )?Build$/ }).getAttribute('aria-selected'))
      .toBe('true');
    await expect
      .poll(() => inspection.evaluate(() => document.activeElement?.textContent ?? ''))
      .toContain(failingCheck);
    expect(await teacher.locator('[data-submission]').count()).toBe(2);
    await teacher.reload();
    await expect.poll(() => teacher.locator('[data-submission]').count()).toBe(2);
  } finally {
    await browser.close();
  }
});

it('keeps an edited student attempt and its assignment after reload and imports the same task independently', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ acceptDownloads: true });
  const { bundle } = classroomFixture();
  const assignment = await assignmentOf(bundle, 60);
  const file = {
    name: 'assignment.caseclass',
    mimeType: 'application/json',
    buffer: Buffer.from(classroomBytes(assignment)),
  };

  try {
    await exposeTestHooks(page);
    await page.goto(`${inject('webUrl')}/classroom`);
    await page.getByLabel('Assignment file').setInputFiles(file);
    await page.getByLabel('Name').fill('Student');
    await page.getByRole('button', { name: 'Start Attempt' }).click();
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await page.mouse.click(720, 450);
    await page.keyboard.press('a');
    await page.getByRole('button', { name: /^Cube/ }).first().click();
    await command(page, 'Submit');
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await expect.poll(() => partCount(page)).toBe(bundle.robot.parts.length + 1);

    const delivered = page.waitForEvent('download');

    await command(page, 'Submit');

    const exported = await readSubmission(new Uint8Array(await readFile((await (await delivered).path())!)));

    expect(exported.assignmentFingerprint).toBe(assignment.fingerprint);
    expect(exported.bundle.robot.parts).toHaveLength(bundle.robot.parts.length + 1);
    await page.goto(`${inject('webUrl')}/classroom`);
    await page.getByLabel('Assignment file').setInputFiles(file);
    await page.getByLabel('Name').fill('Student');
    await page.getByRole('button', { name: 'Start Attempt' }).click();
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await expect.poll(() => partCount(page)).toBe(bundle.robot.parts.length);
  } finally {
    await browser.close();
  }
});
