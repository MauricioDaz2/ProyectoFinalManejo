-- Ejecutar después de script_bd.sql y 011_frecuencias_vigencia.sql en una base de pruebas aislada.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT dbo.COOPERATIVAS (ID_COP,NOM_COP,RUC_COP,DIR_COP,TEL_COP,LOG_URL_COP,EST_COP)
VALUES ('CTV01','Cooperativa prueba','1234567890001','Dirección','0999999999','/', '1');
INSERT dbo.RESOLUCIONES_ANT (ID_RES,FEC_EMI_RES,CUP_FRE_MAX,ID_COP_PER)
VALUES ('RTV01','20260101',5,'CTV01'), ('RTV02','20260101',5,'CTV01');
INSERT dbo.FRECUENCIAS (ID_FRE,CIU_ORI_FRE,CIU_DES_FRE,FEC_HOR_INI_FRE,FEC_HOR_FIN_FRE,EST_RES,ID_RES_PER)
VALUES ('FTV01','AMBATO','QUITO','20260110','20260125','1','RTV01'),
       ('FTV02','AMBATO','PILLARO','20260201',NULL,'1','RTV01'),
       ('FTV03','AMBATO','LATACUNGA','20260101',NULL,'1','RTV02');

UPDATE dbo.RESOLUCIONES_ANT
SET FEC_INI_VIG_RES = '20260115', FEC_FIN_VIG_RES = '20260120'
WHERE ID_RES = 'RTV01';

DECLARE @Casos TABLE (Frecuencia varchar(5), Fecha date, Esperado varchar(25));
INSERT @Casos VALUES ('FTV01','20260114','PENDIENTE'),
                     ('FTV01','20260115','VIGENTE'),
                     ('FTV01','20260120','VIGENTE'),
                     ('FTV01','20260121','VENCIDA'),
                     ('FTV02','20260201','SIN_VIGENCIA_COMUN'),
                     ('FTV03','20260115','SIN_VIGENCIA_ANT');

IF EXISTS (
    SELECT 1 FROM @Casos c
    OUTER APPLY dbo.fn_CC_VigenciaFrecuencia(c.Frecuencia, c.Fecha) v
    WHERE v.EST_VIGENCIA IS NULL OR v.EST_VIGENCIA <> c.Esperado
) THROW 51901, 'La vigencia esperada no coincide.', 1;

UPDATE dbo.RESOLUCIONES_ANT SET REVOCADA_RES = 1 WHERE ID_RES = 'RTV01';
IF NOT EXISTS (
    SELECT 1 FROM dbo.fn_CC_VigenciaFrecuencia('FTV01','20260116') WHERE EST_VIGENCIA = 'REVOCADA'
) THROW 51902, 'Una resolución revocada habilitó una frecuencia.', 1;

UPDATE dbo.RESOLUCIONES_ANT SET REVOCADA_RES = 0, FEC_FIN_VIG_RES = NULL WHERE ID_RES = 'RTV01';
IF NOT EXISTS (
    SELECT 1 FROM dbo.fn_CC_VigenciaFrecuencia('FTV02','20261201')
    WHERE EST_VIGENCIA = 'VIGENTE' AND FIN_EFECTIVO IS NULL
) THROW 51903, 'No se reconoció el permiso sin fecha de fin.', 1;

UPDATE dbo.FRECUENCIAS SET EST_RES = '0' WHERE ID_FRE = 'FTV02';
IF NOT EXISTS (
    SELECT 1 FROM dbo.fn_CC_VigenciaFrecuencia('FTV02','20261201') WHERE EST_VIGENCIA = 'INACTIVA'
) THROW 51904, 'El estado manual se debe respetar.', 1;

IF EXISTS (
    SELECT 1 FROM dbo.fn_CC_VigenciaFrecuencia('FTV01','20260115')
    WHERE INICIO_EFECTIVO IS NULL OR INICIO_EFECTIVO <> '20260115'
       OR FIN_EFECTIVO IS NULL OR FIN_EFECTIVO <> '20260125' OR ID_COP_PER <> 'CTV01'
) THROW 51905, 'El intervalo efectivo o la cooperativa no coinciden.', 1;

SET XACT_ABORT OFF;
BEGIN TRY
    UPDATE dbo.RESOLUCIONES_ANT SET FEC_FIN_VIG_RES = '20260114' WHERE ID_RES = 'RTV01';
    THROW 51906, 'Se aceptó un fin de vigencia anterior al inicio.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() <> 547 THROW;
END CATCH;

ROLLBACK TRANSACTION;
SELECT 'RFC-000070: comprobaciones de vigencia correctas' AS Resultado;
