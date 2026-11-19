-- RFC-000070. Ejecutar en BD_COOPERATIVAS_BUSES después del esquema base.
-- La fecha de emisión no se copia al inicio legal: los permisos existentes
-- quedan pendientes de revisión hasta que se registren sus fechas oficiales.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF COL_LENGTH('dbo.RESOLUCIONES_ANT', 'FEC_INI_VIG_RES') IS NULL
        ALTER TABLE dbo.RESOLUCIONES_ANT ADD FEC_INI_VIG_RES date NULL;
    IF COL_LENGTH('dbo.RESOLUCIONES_ANT', 'FEC_FIN_VIG_RES') IS NULL
        ALTER TABLE dbo.RESOLUCIONES_ANT ADD FEC_FIN_VIG_RES date NULL;
    IF COL_LENGTH('dbo.RESOLUCIONES_ANT', 'REVOCADA_RES') IS NULL
        ALTER TABLE dbo.RESOLUCIONES_ANT ADD REVOCADA_RES bit NOT NULL CONSTRAINT DF_ANT_REVOCADA DEFAULT (0);

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
                   WHERE parent_object_id = OBJECT_ID('dbo.RESOLUCIONES_ANT') AND name = 'CK_ANT_VIGENCIA')
        EXEC(N'ALTER TABLE dbo.RESOLUCIONES_ANT ADD CONSTRAINT CK_ANT_VIGENCIA CHECK (
            FEC_FIN_VIG_RES IS NULL OR (FEC_INI_VIG_RES IS NOT NULL AND FEC_FIN_VIG_RES >= FEC_INI_VIG_RES)
        );');

    -- La fecha se recibe explícitamente para consultar hoy o una salida futura.
    -- Para "hoy", el consumidor debe usar el día de America/Guayaquil.
    EXEC(N'
    CREATE OR ALTER FUNCTION dbo.fn_CC_VigenciaFrecuencia(@Frecuencia varchar(5), @Fecha date)
    RETURNS TABLE AS RETURN
    (
        SELECT f.ID_FRE, r.ID_COP_PER, v.INICIO_EFECTIVO, v.FIN_EFECTIVO,
            CASE
                WHEN ISNULL(f.EST_RES, ''0'') <> ''1'' THEN ''INACTIVA''
                WHEN r.REVOCADA_RES = 1 THEN ''REVOCADA''
                WHEN r.FEC_INI_VIG_RES IS NULL THEN ''SIN_VIGENCIA_ANT''
                WHEN v.FIN_EFECTIVO < v.INICIO_EFECTIVO THEN ''SIN_VIGENCIA_COMUN''
                WHEN @Fecha IS NULL THEN ''FECHA_INVALIDA''
                WHEN @Fecha < v.INICIO_EFECTIVO THEN ''PENDIENTE''
                WHEN @Fecha > v.FIN_EFECTIVO THEN ''VENCIDA''
                ELSE ''VIGENTE''
            END AS EST_VIGENCIA
        FROM dbo.FRECUENCIAS f
        JOIN dbo.RESOLUCIONES_ANT r ON r.ID_RES = f.ID_RES_PER
        CROSS APPLY (VALUES (
            CASE WHEN r.FEC_INI_VIG_RES IS NOT NULL THEN GREATEST(f.FEC_HOR_INI_FRE, r.FEC_INI_VIG_RES) END,
            CASE WHEN r.FEC_INI_VIG_RES IS NOT NULL THEN LEAST(f.FEC_HOR_FIN_FRE, r.FEC_FIN_VIG_RES) END
        )) v(INICIO_EFECTIVO, FIN_EFECTIVO)
        WHERE f.ID_FRE = @Frecuencia
    );');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
