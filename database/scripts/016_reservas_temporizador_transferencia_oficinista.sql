-- RFC-000080: Temporizador de 5 minutos para reservas por transferencia,
-- bandeja de aprobacion en Oficinista, pago en efectivo exclusivo en ventanilla
-- y soporte de revision de comprobantes en dbo.BOLETOS.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Asegurar columnas de pasajero y comprobante de pago en BOLETOS
    IF COL_LENGTH('dbo.BOLETOS', 'CED_PAS_BOL') IS NULL
        ALTER TABLE dbo.BOLETOS ADD CED_PAS_BOL varchar(10) NULL;

    IF COL_LENGTH('dbo.BOLETOS', 'TIP_PAS_BOL') IS NULL
        ALTER TABLE dbo.BOLETOS ADD TIP_PAS_BOL varchar(15) NULL;

    IF COL_LENGTH('dbo.BOLETOS', 'COM_PAG_URL') IS NULL
        ALTER TABLE dbo.BOLETOS ADD COM_PAG_URL varchar(500) NULL;

    IF COL_LENGTH('dbo.BOLETOS', 'BAN_ORI_BOL') IS NULL
        ALTER TABLE dbo.BOLETOS ADD BAN_ORI_BOL varchar(60) NULL;

    -- 2. Columnas para el temporizador de 5 minutos y estado de revision de transferencia
    IF COL_LENGTH('dbo.BOLETOS', 'FEC_EXP_RES_UTC') IS NULL
        ALTER TABLE dbo.BOLETOS ADD FEC_EXP_RES_UTC datetime2(0) NULL;

    IF COL_LENGTH('dbo.BOLETOS', 'EST_REV_PAG') IS NULL
        ALTER TABLE dbo.BOLETOS ADD EST_REV_PAG varchar(25) NULL;

    IF COL_LENGTH('dbo.BOLETOS', 'FEC_REV_PAG_UTC') IS NULL
        ALTER TABLE dbo.BOLETOS ADD FEC_REV_PAG_UTC datetime2(0) NULL;

    -- 3. Inicializar estado de revision en reservas por transferencia existentes
    EXEC(N'
        UPDATE dbo.BOLETOS
        SET EST_REV_PAG = CASE
            WHEN EST_BOL IN (''PAGADO'', ''EMITIDO'', ''USADO'') THEN ''APROBADO''
            WHEN EST_BOL IN (''CANCELADO'', ''ANULADO'') THEN ''RECHAZADO''
            WHEN EST_BOL = ''VENCIDO'' THEN ''EXPIRADO''
            WHEN COM_PAG_URL IS NOT NULL AND LTRIM(RTRIM(COM_PAG_URL)) <> '''' THEN ''EN_REVISION''
            ELSE ''PENDIENTE_COMPROBANTE''
        END
        WHERE MET_PAG_BOL = ''TRANSFERENCIA''
          AND EST_REV_PAG IS NULL;
    ');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
