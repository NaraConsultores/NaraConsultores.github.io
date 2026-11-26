import { n as fromCents, r as paymentRecord, t as addFinanceDocument } from "./processor.mjs";
//#region src/modules/pagos/paymentExamples.js
async function installPaymentExamples(state, examples, generate) {
	const cases = new Map(state.expedientes.map((item) => [item.id, item]));
	const metadata = state.publishedSample ? {
		fictitious: true,
		publishedPaymentExample: true
	} : { fictitious: true };
	for (const row of examples || []) {
		const exp = cases.get(row.expedienteId);
		if (!exp?.compras.invoices.some((invoice) => invoice.number === row.number)) continue;
		const actor = "Datos de referencia demo", at = `${row.paymentDate || row.date}T12:00:00-06:00`;
		const file = await generate("pdf", {
			title: "Soporte ficticio de factura",
			filename: `${row.id}.pdf`,
			reference: `${exp.id} · ${row.number}`,
			total: fromCents(row.totalCents),
			currency: row.currency,
			description: "Referencia de capacitación. Los importes y fechas pertenecen a la simulación."
		});
		const documentId = addFinanceDocument(state, {
			id: `SUP-${row.id}`,
			type: "soporte-pago",
			file,
			expedienteIds: [exp.id],
			metadata
		}, {
			actor,
			at
		}).documentId;
		const obligation = {
			id: row.id,
			number: row.number,
			date: row.date,
			total: fromCents(row.totalCents),
			totalCents: row.totalCents,
			openingPaid: 0,
			currency: row.currency,
			company: exp.company,
			supplier: exp.supplier,
			expedienteIds: [exp.id],
			documentId,
			fictitious: true
		};
		state.obligations.push(obligation);
		if (!row.paymentId) continue;
		const getpay = {
			status: row.status,
			reference: row.getpay,
			date: row.paymentDate,
			documentId: null
		};
		const payment = paymentRecord({
			id: row.paymentId,
			obligation,
			amount: fromCents(row.requestedCents),
			source: "compras",
			getpay
		});
		Object.assign(payment, {
			documentId,
			dueDate: row.dueDate,
			dueTerms: { kind: "informado" },
			createdAt: at,
			createdBy: actor,
			fictitious: true,
			comments: "Seguimiento ficticio vinculado a un expediente precargado de la demo."
		});
		payment.events.push({
			id: `${payment.id}-1`,
			action: "reserva",
			at,
			actor,
			applications: structuredClone(payment.applications)
		});
		if (row.getpay) payment.events.push({
			id: `${payment.id}-2`,
			action: "getpay_informado",
			at,
			actor,
			data: getpay
		});
		if (row.paidCents) {
			const application = payment.applications[0], paid = fromCents(row.paidCents);
			Object.assign(application, {
				paid,
				paidCents: row.paidCents
			});
			const proofFile = await generate("pdf", {
				title: "Comprobante ficticio de desembolso",
				filename: `${row.paymentId}-DESEMBOLSO.pdf`,
				reference: row.getpay,
				total: paid,
				currency: row.currency
			});
			const proof = addFinanceDocument(state, {
				id: `SUP-${payment.id}-DESEMBOLSO`,
				type: "comprobante-pago",
				file: proofFile,
				expedienteIds: [exp.id],
				metadata: {
					...metadata,
					paymentId: payment.id
				}
			}, {
				actor,
				at
			}).documentId;
			const disbursement = {
				id: `${payment.id}-3`,
				date: row.paymentDate,
				amount: paid,
				amountCents: row.paidCents,
				at,
				actor,
				documentId: proof,
				transferReference: `TR-${payment.id}`,
				getpayReference: row.getpay,
				allocations: [{
					obligationId: row.id,
					amount: paid,
					amountCents: row.paidCents
				}]
			};
			payment.disbursements.push(disbursement);
			payment.events.push({
				...disbursement,
				action: "desembolso_confirmado"
			});
			payment.status = row.paidCents === row.requestedCents ? "pagado" : "parcial";
		}
		state.payments.push(payment);
	}
	return state;
}
//#endregion
export { installPaymentExamples };
