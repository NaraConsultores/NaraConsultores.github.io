//#region src/adapters/translationXlsx.js
async function generateTranslationXlsx(data, { onProgress } = {}) {
	onProgress?.({ label: "Abriendo la plantilla de traducción…" });
	const module = await import("exceljs"), ExcelJS = module.default || module;
	const format = data.translationTemplate, book = new ExcelJS.Workbook();
	if (!format?.templateBase64 || !Array.isArray(format.headers)) throw new Error("Falta la plantilla observada de traducción.");
	const bytes = Uint8Array.from(atob(format.templateBase64), (character) => character.charCodeAt(0));
	await book.xlsx.load(bytes);
	const sheet = book.getWorksheet(format.sheetName);
	if (!sheet || book.worksheets.length !== 1) throw new Error("La plantilla debe contener únicamente la hoja de traducción.");
	const headers = format.headers.map((_, index) => sheet.getCell(1, index + 1).value);
	if (JSON.stringify(headers) !== JSON.stringify(data.headers)) throw new Error("Las columnas no corresponden a la plantilla de traducción.");
	format.headerNumberFormats?.forEach((mask, index) => {
		sheet.getCell(1, index + 1).numFmt = mask;
	});
	const styles = format.headers.map((_, index) => {
		const style = structuredClone(sheet.getCell(2, index + 1).style);
		if (format.bodyNumberFormats?.[index]) style.numFmt = format.bodyNumberFormats[index];
		return style;
	});
	const height = sheet.getRow(2).height;
	if (sheet.rowCount > 1) sheet.spliceRows(2, sheet.rowCount - 1);
	const total = data.rows.length;
	for (const [index, values] of data.rows.entries()) {
		if (onProgress && index % 200 === 0) {
			onProgress({
				label: "Generando líneas del Excel…",
				completed: index,
				total
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		if (values.length !== headers.length) throw new Error("Una línea no tiene todas las columnas de traducción.");
		const row = sheet.addRow(values);
		row.height = height;
		values.forEach((value, index) => {
			const cell = row.getCell(index + 1);
			cell.style = styles[index];
			if (format.formulas?.[index]) cell.value = {
				formula: format.formulas[index].replace(/^=/, "").replace(/\b(\$?[A-Z]{1,3})(\$?)2\b/g, (_, column, absolute) => `${column}${absolute}${absolute ? 2 : row.number}`),
				result: value
			};
		});
	}
	if (sheet.autoFilter) sheet.autoFilter = {
		from: {
			row: 1,
			column: 1
		},
		to: {
			row: Math.max(2, data.rows.length + 1),
			column: headers.length
		}
	};
	book.calcProperties.fullCalcOnLoad = true;
	if (onProgress) {
		onProgress({ label: "Comprimiendo el Excel…" });
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	const output = await book.xlsx.writeBuffer(), type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	return {
		name: data.name,
		type,
		blob: new Blob([output], { type }),
		rows: data.rows,
		headers
	};
}
//#endregion
export { generateTranslationXlsx };
